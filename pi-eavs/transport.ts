import { Agent as HttpAgent, request as httpRequest } from "node:http";
import { Agent as HttpsAgent, request as httpsRequest } from "node:https";
import { Readable } from "node:stream";
import { scopedKey, serverOrigin } from "./catalog.js";

export const MAX_CATALOG_BYTES = 4 * 1024 * 1024;
export class CatalogError extends Error {
	constructor(readonly kind: "auth" | "transient" | "invalid") {
		super(
			kind === "auth"
				? "EAVS scoped authorization denied."
				: kind === "invalid"
					? "EAVS metadata invalid."
					: "EAVS metadata temporarily unavailable."
		);
	}
}
/** Safe per-request transport progress: no URLs, headers, raw bodies or keys.
 * `detail` is the upstream error message only, extracted and sanitized. */
export type TransportState =
	| { stage: "started" }
	| { stage: "refused" }
	| { stage: "sending"; bodyKiB: number }
	| { stage: "network"; code?: string; bodyKiB: number }
	| { stage: "cancelled" }
	| { stage: "response"; status: number; detail?: string };

const MAX_ERROR_BODY_BYTES = 16 * 1024;
const MAX_DETAIL_CHARS = 300;
// Anything credential-shaped: EAVS/OpenAI-style keys, bearer values, key=value
// secrets and long opaque tokens. Upstreams sometimes echo request headers.
const SECRET_PATTERNS = [
	/\b(?:eavs|sk|pk|rk)-[A-Za-z0-9_-]{6,}/g,
	/\bBearer\s+\S+/gi,
	/\b(?:api[_-]?key|token|secret|password|authorization)\s*[=:]\s*\S+/gi,
	/\b[A-Za-z0-9+/_-]{32,}={0,2}/g,
];

/** The human-readable message from an upstream error body, or undefined.
 * Single line, control characters removed, secrets redacted, length capped. */
export function upstreamDetail(body: string): string | undefined {
	let text: unknown = body;
	try {
		const parsed: unknown = JSON.parse(body);
		const pick = (v: unknown): unknown => {
			if (!v || typeof v !== "object") return;
			const o = v as Record<string, unknown>;
			if (typeof o.error === "string") return o.error;
			return (
				pick(o.error) ??
				(typeof o.message === "string" ? o.message : undefined) ??
				(typeof o.detail === "string" ? o.detail : undefined)
			);
		};
		text = pick(parsed);
	} catch {
		/* Not JSON: use the plain text body. */
	}
	if (typeof text !== "string") return;
	let detail = Array.from(text)
		.map((c) => {
			const code = c.charCodeAt(0);
			return code < 32 || (code >= 127 && code <= 159) ? " " : c;
		})
		.join("")
		.replace(/\s+/g, " ")
		.trim();
	for (const pattern of SECRET_PATTERNS) detail = detail.replace(pattern, "[redacted]");
	if (!detail) return;
	return detail.length > MAX_DETAIL_CHARS ? `${detail.slice(0, MAX_DETAIL_CHARS)}…` : detail;
}

// Node/OpenSSL error codes identify the failure class and contain no secrets.
const safeCode = (error: unknown): string | undefined => {
	const code = (error as { code?: unknown } | undefined)?.code;
	return typeof code === "string" && /^[A-Z][A-Z0-9_]{1,47}$/.test(code) ? code : undefined;
};

export type CatalogFetch = (
	origin: string,
	key: string,
	signal: AbortSignal,
	allowHttpOrigins?: readonly string[]
) => Promise<unknown>;

/** Private standard-library transport: verifies TLS even if ambient TLS checks
 * are disabled; no environment proxy, cookie jar, redirects or credentials files.
 * Used for native SDK inference too, to prevent redirect credential forwarding.
 */
export function secureFetch(
	origin: string,
	httpOrigins: () => readonly string[] = () => [],
	onState?: (state: TransportState) => void
): typeof fetch {
	serverOrigin(origin, httpOrigins());
	return async (input, init) => {
		onState?.({ stage: "started" });
		const refuse = () => {
			onState?.({ stage: "refused" });
			return new Error("EAVS request destination refused.");
		};
		if ((globalThis as { Bun?: unknown }).Bun) throw new Error("EAVS secure transport requires Node.js.");
		const req = new Request(input, init);
		const url = new URL(req.url);
		if (url.origin !== origin || url.username || url.password || url.hash) throw refuse();
		try {
			serverOrigin(origin, httpOrigins());
		} catch {
			throw refuse();
		}
		const cancelled = () => {
			onState?.({ stage: "cancelled" });
			req.signal.throwIfAborted();
		};
		if (req.signal.aborted) cancelled();
		const body = req.body ? Buffer.from(await req.arrayBuffer()) : undefined;
		const bodyKiB = Math.ceil((body?.byteLength ?? 0) / 1024);
		// Buffering a request can yield; honor revocation/cancellation before sending.
		try {
			serverOrigin(origin, httpOrigins());
		} catch {
			throw refuse();
		}
		if (req.signal.aborted) cancelled();
		onState?.({ stage: "sending", bodyKiB });
		return new Promise<Response>((resolve, reject) => {
			const tls = url.protocol === "https:";
			const agent = tls
				? new HttpsAgent({ keepAlive: false, rejectUnauthorized: true, ...{ proxyEnv: {} } })
				: new HttpAgent({ keepAlive: false, ...{ proxyEnv: {} } });
			const request = tls ? httpsRequest : httpRequest;
			let aborted = false;
			const fail = (error?: unknown) => {
				onState?.(aborted ? { stage: "cancelled" } : { stage: "network", code: safeCode(error), bodyKiB });
				reject(new Error("EAVS secure request failed."));
			};
			const outgoing = request(
				url,
				{
					method: req.method,
					headers: { ...Object.fromEntries(req.headers), "accept-encoding": "identity" },
					agent,
					rejectUnauthorized: true,
					maxHeaderSize: 16 * 1024,
				},
				(incoming) => {
					const status = incoming.statusCode ?? 500;
					onState?.({ stage: "response", status });
					if (status >= 300 && status < 400) {
						incoming.destroy();
						reject(new Error("EAVS secure request failed."));
						return;
					}
					const headers = new Headers();
					for (let i = 0; i < incoming.rawHeaders.length; i += 2)
						headers.append(incoming.rawHeaders[i], incoming.rawHeaders[i + 1]);
					if (status >= 400 && req.method !== "HEAD") {
						// Error bodies are small: buffer a bounded prefix so the user sees
						// why the gateway or upstream refused. The SDK gets the same bytes.
						const chunks: Buffer[] = [];
						let size = 0;
						incoming.on("data", (chunk: Buffer) => {
							if (size < MAX_ERROR_BODY_BYTES) chunks.push(chunk.subarray(0, MAX_ERROR_BODY_BYTES - size));
							size += chunk.length;
						});
						incoming.once("end", () => {
							const body = Buffer.concat(chunks);
							onState?.({ stage: "response", status, detail: upstreamDetail(body.toString("utf8")) });
							resolve(new Response(body, { status, headers }));
						});
						incoming.once("error", fail);
						return;
					}
					const stream = Readable.toWeb(incoming) as ReadableStream<Uint8Array>;
					resolve(new Response([204, 205, 304].includes(status) || req.method === "HEAD" ? null : stream, { status, headers }));
				}
			);
			const abort = () => {
				aborted = true;
				outgoing.destroy(new Error("EAVS request cancelled."));
			};
			outgoing.on("error", fail);
			// Metadata has a six-second total deadline; inference uses its caller signal.
			outgoing.once("close", () => {
				req.signal.removeEventListener("abort", abort);
				agent.destroy();
			});
			req.signal.addEventListener("abort", abort, { once: true });
			if (req.signal.aborted) abort();
			else outgoing.end(body);
		});
	};
}

export const fetchCatalog: CatalogFetch = async (origin, key, signal, allowHttpOrigins = []) => {
	serverOrigin(origin, allowHttpOrigins);
	scopedKey(key);
	const controller = new AbortController();
	const abort = () => controller.abort();
	const timer = setTimeout(abort, 6_000);
	signal.addEventListener("abort", abort, { once: true });
	let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
	try {
		signal.throwIfAborted();
		const response = await secureFetch(origin, () => allowHttpOrigins)(`${origin}/v1/eavs/catalog`, {
			method: "GET",
			headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
			signal: controller.signal,
		});
		if (response.status !== 200 || !response.body) {
			await response.body?.cancel();
			throw new CatalogError(response.status === 401 || response.status === 403 ? "auth" : "transient");
		}
		reader = response.body.getReader();
		const chunks: Buffer[] = [];
		let size = 0;
		for (;;) {
			const chunk = await reader.read();
			if (chunk.done) break;
			size += chunk.value.byteLength;
			if (size > MAX_CATALOG_BYTES) throw new CatalogError("invalid");
			chunks.push(Buffer.from(chunk.value));
		}
		try {
			return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks)));
		} catch {
			throw new CatalogError("invalid");
		}
	} catch (error) {
		if (error instanceof CatalogError) throw error;
		throw new CatalogError("transient");
	} finally {
		clearTimeout(timer);
		signal.removeEventListener("abort", abort);
		controller.abort();
		try {
			await reader?.cancel();
		} catch {
			/* Aborted or already closed. */
		}
		reader?.releaseLock();
	}
};

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
	onStatus?: (status: number | undefined) => void
): typeof fetch {
	serverOrigin(origin, httpOrigins());
	return async (input, init) => {
		onStatus?.(undefined);
		if ((globalThis as { Bun?: unknown }).Bun) throw new Error("EAVS secure transport requires Node.js.");
		const req = new Request(input, init);
		const url = new URL(req.url);
		if (url.origin !== origin || url.username || url.password || url.hash || serverOrigin(origin, httpOrigins()) !== origin)
			throw new Error("EAVS request destination refused.");
		req.signal.throwIfAborted();
		const body = req.body ? Buffer.from(await req.arrayBuffer()) : undefined;
		// Buffering a request can yield; honor revocation/cancellation before sending.
		serverOrigin(origin, httpOrigins());
		req.signal.throwIfAborted();
		return new Promise<Response>((resolve, reject) => {
			const tls = url.protocol === "https:";
			const agent = tls
				? new HttpsAgent({ keepAlive: false, rejectUnauthorized: true, ...{ proxyEnv: {} } })
				: new HttpAgent({ keepAlive: false, ...{ proxyEnv: {} } });
			const request = tls ? httpsRequest : httpRequest;
			const fail = () => reject(new Error("EAVS secure request failed."));
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
					onStatus?.(status);
					if (status >= 300 && status < 400) {
						incoming.destroy();
						fail();
						return;
					}
					const headers = new Headers();
					for (let i = 0; i < incoming.rawHeaders.length; i += 2)
						headers.append(incoming.rawHeaders[i], incoming.rawHeaders[i + 1]);
					const stream = Readable.toWeb(incoming) as ReadableStream<Uint8Array>;
					resolve(new Response([204, 205, 304].includes(status) || req.method === "HEAD" ? null : stream, { status, headers }));
				}
			);
			const abort = () => outgoing.destroy(new Error("EAVS request cancelled."));
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

import { execFile } from "node:child_process";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { type IncomingMessage, createServer } from "node:http";
import { isIP } from "node:net";
import { networkInterfaces } from "node:os";
import { promisify } from "node:util";
import type { SelectionRecord } from "./model.js";
import type { SelectionStore } from "./store.js";
import { reviewHtml } from "./web.js";

export interface BrowserOptions {
	mode: "tailnet" | "lan";
	bindAddress?: string;
	port?: number;
	ttlMs?: number;
	discoverTailnet?: () => Promise<string>;
}
function local(address: string) {
	return Object.values(networkInterfaces())
		.flat()
		.some((i) => i?.address === address);
}
function privateIPv4(address: string) {
	const p = address.split(".").map(Number);
	return isIP(address) === 4 && (p[0] === 10 || (p[0] === 172 && p[1] >= 16 && p[1] <= 31) || (p[0] === 192 && p[1] === 168));
}
async function addressFor(options: BrowserOptions) {
	if (options.mode === "lan") {
		if (!options.bindAddress || !privateIPv4(options.bindAddress) || !local(options.bindAddress))
			throw new Error("LAN requires an explicit private local IPv4 address");
		return options.bindAddress;
	}
	if (options.mode !== "tailnet") throw new Error("Invalid mode");
	const address = (
		await (options.discoverTailnet?.() ??
			promisify(execFile)("tailscale", ["ip", "-4"], { timeout: 5000, maxBuffer: 4096 }).then((r) => r.stdout))
	).trim();
	const p = address.split(".").map(Number);
	if (
		isIP(address) !== 4 ||
		p[0] !== 100 ||
		p[1] < 64 ||
		p[1] > 127 ||
		!local(address) ||
		(options.bindAddress && options.bindAddress !== address)
	)
		throw new Error("No confirmed local tailnet IPv4 address");
	return address;
}
function equal(a: string, b: string) {
	const x = Buffer.from(a);
	const y = Buffer.from(b);
	return x.length === y.length && timingSafeEqual(x, y);
}
async function body(req: IncomingMessage): Promise<unknown> {
	return new Promise((resolve, reject) => {
		let size = 0;
		const chunks: Buffer[] = [];
		req.on("data", (chunk: Buffer) => {
			size += chunk.length;
			if (size > 256 * 1024) {
				reject(new Error("Body limit"));
				return;
			}
			chunks.push(chunk);
		});
		req.on("error", reject);
		req.on("end", () => {
			if (size > 256 * 1024) return;
			try {
				resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
			} catch (error) {
				reject(error);
			}
		});
	});
}
export async function startBrowserReview(store: SelectionStore, record: SelectionRecord, options: BrowserOptions) {
	return start(store, record, options, await addressFor(options));
}
/** Explicit isolated-test helper: always binds loopback, never a production fallback. */
export async function startBrowserReviewForTest(
	store: SelectionStore,
	record: SelectionRecord,
	options: Pick<BrowserOptions, "ttlMs" | "port"> = {}
) {
	return start(store, record, { ...options, mode: "lan" }, "127.0.0.1");
}
async function handleApiRequest(
	req: IncomingMessage,
	store: SelectionStore,
	record: SelectionRecord,
	origin: string,
	csrf: string,
	send: (status: number, value: unknown) => void
) {
	try {
		if (req.method === "GET" && req.url === "/api/review") {
			send(200, { record: await store.get(record.id, record.scopeId), csrf });
			return;
		}
		if (req.method !== "POST" || !["/api/save", "/api/submit", "/api/cancel"].includes(req.url ?? "")) {
			send(404, { error: "Not found" });
			return;
		}
		if (
			req.headers.origin !== origin ||
			!equal(String(req.headers["x-csrf-nonce"] ?? ""), csrf) ||
			req.headers["content-type"] !== "application/json"
		) {
			send(403, { error: "Invalid origin or CSRF" });
			return;
		}
		if (Number(req.headers["content-length"] ?? 0) > 256 * 1024) {
			req.resume();
			send(413, { error: "Body limit" });
			return;
		}
		const input = (await body(req)) as { revision: number; answers: unknown };
		if (!input || typeof input !== "object" || !Number.isSafeInteger(input.revision)) {
			send(400, { error: "Invalid request" });
			return;
		}
		const next =
			req.url === "/api/cancel"
				? await store.cancel(record.id, record.scopeId, input.revision, input.answers)
				: await store.update(record.id, record.scopeId, input.revision, input.answers, req.url === "/api/submit");
		send(200, { record: next });
	} catch (error) {
		const message = error instanceof Error ? error.message : "Request failed";
		send(message === "Revision conflict" ? 409 : message === "Body limit" ? 413 : 400, { error: message });
	}
}
async function start(store: SelectionStore, record: SelectionRecord, options: BrowserOptions, address: string) {
	await store.get(record.id, record.scopeId);
	const ttl = options.ttlMs ?? 15 * 60 * 1000;
	if (!Number.isSafeInteger(ttl) || ttl <= 0 || ttl > 24 * 60 * 60 * 1000) throw new Error("Invalid TTL");
	const token = randomBytes(32).toString("base64url");
	const csrf = randomBytes(32).toString("base64url");
	const nonce = randomBytes(24).toString("base64url");
	const expires = Date.now() + ttl;
	let origin = "";
	let host = "";
	const server = createServer(async (req, res) => {
		res.setHeader("Cache-Control", "no-store");
		res.setHeader("X-Content-Type-Options", "nosniff");
		res.setHeader("Referrer-Policy", "no-referrer");
		res.setHeader(
			"Content-Security-Policy",
			`default-src 'none'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`
		);
		const send = (status: number, value: unknown) => {
			res.writeHead(status, { "Content-Type": "application/json" });
			res.end(JSON.stringify(value));
		};
		if (Date.now() >= expires) {
			send(410, { error: "Review expired" });
			return;
		}
		if (req.headers.host !== host || req.rawHeaders.filter((v, i) => i % 2 === 0 && v.toLowerCase() === "host").length !== 1) {
			send(403, { error: "Invalid Host" });
			return;
		}
		if (req.method === "GET" && req.url === "/") {
			res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
			res.end(reviewHtml(nonce));
			return;
		}
		if (!equal(req.headers.authorization ?? "", `Bearer ${token}`)) {
			send(401, { error: "Unauthorized" });
			return;
		}
		await handleApiRequest(req, store, record, origin, csrf, send);
	});
	server.requestTimeout = 10000;
	server.headersTimeout = 10000;
	await new Promise<void>((resolve, reject) => {
		server.once("error", reject);
		server.listen(options.port ?? 0, address, () => {
			server.off("error", reject);
			resolve();
		});
	});
	const info = server.address();
	if (!info || typeof info === "string") throw new Error("Invalid listener");
	host = `${address}:${info.port}`;
	origin = `http://${host}`;
	let closing: Promise<void> | undefined;
	const close = () => {
		if (!closing) {
			clearTimeout(timer);
			closing = new Promise<void>((resolve, reject) => {
				server.close((error) => (error ? reject(error) : resolve()));
				server.closeAllConnections();
			});
		}
		return closing;
	};
	const timer = setTimeout(() => {
		void close().catch(() => undefined);
	}, ttl);
	timer.unref();
	return { url: `${origin}/#${token}`, address, port: info.port, close };
}

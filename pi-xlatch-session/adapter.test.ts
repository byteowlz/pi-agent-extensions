import { afterEach, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as net from "node:net";
import * as os from "node:os";
import * as path from "node:path";

const roots: string[] = [];
const adapter = path.resolve("pi-xlatch-session/adapter.py");

afterEach(() => {
	for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

async function deliver(input: object): Promise<{ payload: Record<string, unknown>; incoming: string }> {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), "pi-xlatch-adapter-"));
	roots.push(root);
	const socketPath = path.join(root, "session.sock");
	const incoming = path.join(root, "incoming");
	let acceptPayload: ((value: Record<string, unknown>) => void) | undefined;
	const payload = new Promise<Record<string, unknown>>((resolve) => {
		acceptPayload = resolve;
	});
	const server = net.createServer((connection) => {
		let body = "";
		connection.setEncoding("utf8");
		connection.on("data", (chunk) => {
			body += chunk;
			if (!body.includes("\n")) return;
			acceptPayload?.(JSON.parse(body.split("\n", 1)[0]) as Record<string, unknown>);
			connection.end(`${JSON.stringify({ ok: true, text: "Delivered.", delivery: "immediate" })}\n`);
		});
	});
	await new Promise<void>((resolve, reject) => {
		server.once("error", reject);
		server.listen(socketPath, resolve);
	});
	try {
		const process = Bun.spawn(["/usr/bin/python3", adapter, "--socket", socketPath, "--dir", incoming], {
			stdin: new TextEncoder().encode(JSON.stringify(input)),
			stdout: "pipe",
			stderr: "pipe",
		});
		const [status, output, received] = await Promise.all([
			process.exited,
			new Response(process.stdout).json() as Promise<Record<string, unknown>>,
			payload,
		]);
		expect(status).toBe(0);
		expect(output.ok).toBe(true);
		return { payload: received, incoming };
	} finally {
		await new Promise<void>((resolve) => server.close(() => resolve()));
	}
}

test("copies inline PDFs and sends only their local path", async () => {
	const bytes = Buffer.from("%PDF-1.7\nfixture\n");
	const { payload } = await deliver({
		mime_type: "application/pdf",
		file: { name: "report.pdf", mime_type: "application/pdf", data_base64: bytes.toString("base64") },
	});
	const saved = payload.path as string;
	expect(payload.kind).toBe("file");
	expect(payload.file_mime_type).toBe("application/pdf");
	expect(path.basename(saved)).toBe("report.pdf");
	expect(fs.readFileSync(saved)).toEqual(bytes);
});

test("streams uploaded files larger than the old adapter limit into incoming", async () => {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), "pi-xlatch-upload-"));
	roots.push(root);
	const source = path.join(root, "executor-upload.bin");
	const bytes = Buffer.alloc(9 * 1024 * 1024, 0x5a);
	fs.writeFileSync(source, bytes);
	const { payload, incoming } = await deliver({
		mime_type: "application/x-custom-document",
		file: {
			artifact_id: "owned-upload",
			name: "archive.custom",
			mime_type: "application/x-custom-document",
			size: bytes.length,
			path: source,
		},
	});
	const saved = payload.path as string;
	expect(path.dirname(saved)).toBe(incoming);
	expect(saved).not.toBe(source);
	expect(payload.bytes).toBe(bytes.length);
	expect(fs.readFileSync(saved)).toEqual(bytes);
});

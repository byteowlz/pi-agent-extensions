import { expect, test } from "bun:test";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { type Server, createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { probeAgent } from "./agent-connection.js";

async function listen(server: Server, path: string) {
	await new Promise<void>((resolve, reject) => {
		server.once("error", reject);
		server.listen(path, resolve);
	});
}
async function close(server: Server) {
	await new Promise<void>((resolve) => server.close(() => resolve()));
}

test("real SSH protocol reply accepts an empty agent, including fragmented packets", async () => {
	const dir = await mkdtemp(join(tmpdir(), "ssh-probe-"));
	const sock = join(dir, "agent.sock");
	const server = createServer((client) =>
		client.once("data", (data) => {
			expect([...data]).toEqual([0, 0, 0, 1, 11]);
			client.write(Buffer.from([0, 0]));
			setTimeout(() => client.end(Buffer.from([0, 5, 12, 0, 0, 0, 0])), 5);
		})
	);
	try {
		await listen(server, sock);
		expect(await probeAgent(sock, 200)).toBe(true);
	} finally {
		await close(server);
		await rm(dir, { recursive: true, force: true });
	}
});
test("responsive policy proxy SSH_AGENT_FAILURE is live, never grounds for unrestricted fallback", async () => {
	const dir = await mkdtemp(join(tmpdir(), "ssh-probe-"));
	const sock = join(dir, "proxy.sock");
	const server = createServer((client) => client.once("data", () => client.end(Buffer.from([0, 0, 0, 1, 5]))));
	try {
		await listen(server, sock);
		expect(await probeAgent(sock, 200)).toBe(true);
	} finally {
		await close(server);
		await rm(dir, { recursive: true, force: true });
	}
});
test("connected but silent or malformed sockets fail within a bounded deadline", async () => {
	const dir = await mkdtemp(join(tmpdir(), "ssh-probe-"));
	const sock = join(dir, "silent.sock");
	const server = createServer((client) => client.on("error", () => {}));
	try {
		await listen(server, sock);
		const start = Date.now();
		expect(await probeAgent(sock, 60)).toBe(false);
		expect(Date.now() - start).toBeLessThan(1000);
	} finally {
		await close(server);
		await rm(dir, { recursive: true, force: true });
	}
	const malformed = createServer((client) => client.once("data", () => client.end(Buffer.from([255, 255, 255, 255]))));
	const second = await mkdtemp(join(tmpdir(), "ssh-probe-"));
	try {
		await listen(malformed, join(second, "bad.sock"));
		expect(await probeAgent(join(second, "bad.sock"), 200)).toBe(false);
	} finally {
		await close(malformed);
		await rm(second, { recursive: true, force: true });
	}
});
test("a socket inode left by a killed server is NOT a live agent", async () => {
	const dir = await mkdtemp(join(tmpdir(), "ssh-probe-"));
	const sock = join(dir, "stale.sock");
	const child = spawn(
		process.execPath,
		["-e", `require('node:net').createServer().listen(${JSON.stringify(sock)},()=>process.stdout.write('ready\\n'))`],
		{ stdio: ["ignore", "pipe", "pipe"] }
	);
	try {
		await new Promise<void>((resolve, reject) => {
			child.stdout.once("data", () => resolve());
			child.once("error", reject);
		});
		const exited = new Promise<void>((resolve) => child.once("exit", () => resolve()));
		child.kill("SIGKILL");
		await exited;
		expect(await probeAgent(sock, 200)).toBe(false);
	} finally {
		child.kill("SIGKILL");
		await rm(dir, { recursive: true, force: true });
	}
});

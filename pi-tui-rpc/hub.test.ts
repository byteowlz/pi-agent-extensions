import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { createHub } from "./hub";
import { safeParseLine, validateCommand } from "./protocol";

describe("pi-tui-rpc protocol", () => {
	test("strict LF framing with CRLF tolerance", () => {
		expect(safeParseLine('{"type":"abort"}')).toEqual({ ok: true, value: { type: "abort" } });
		expect(safeParseLine('{"type":"abort"}\r')).toEqual({ ok: true, value: { type: "abort" } });
		const parsed = safeParseLine("{not json");
		expect(parsed.ok).toBe(false);
		if (!parsed.ok) {
			expect(parsed.error).toContain("invalid JSON");
		}
	});

	test("empty lines are reported as empty", () => {
		const parsed = safeParseLine("   ");
		expect(parsed.ok).toBe(false);
	});

	test("command validation", () => {
		expect(validateCommand("nope").ok).toBe(false);
		expect(validateCommand({ type: "prompt" }).ok).toBe(false);
		expect(validateCommand({ type: "prompt", message: "" }).ok).toBe(false);
		expect(validateCommand({ type: "prompt", message: "hi", streamingBehavior: "nextTurn" }).ok).toBe(false);
		expect(validateCommand({ type: "lease", action: "steal" }).ok).toBe(false);
		expect(validateCommand({ type: "teleport" }).ok).toBe(false);

		const prompt = validateCommand({ id: "1", type: "prompt", message: "hi", streamingBehavior: "steer" });
		expect(prompt.ok).toBe(true);
		if (prompt.ok) {
			expect(prompt.command).toEqual({ id: "1", type: "prompt", message: "hi", streamingBehavior: "steer" });
		}
		const lease = validateCommand({ type: "lease", action: "request" });
		expect(lease.ok).toBe(true);
	});
});

function connect(socketPath: string): Promise<net.Socket> {
	return new Promise((resolve, reject) => {
		const socket = net.connect(socketPath, () => {
			resolve(socket);
		});
		socket.once("error", reject);
	});
}

interface LineReader {
	lines(): string[];
	waitFor(match: string): Promise<string>;
}

function readLines(socket: net.Socket): LineReader {
	const lines: string[] = [];
	let buffer = "";
	let notify: (() => void) | null = null;
	socket.setEncoding("utf8");
	socket.on("data", (chunk: string) => {
		buffer += chunk;
		let index = buffer.indexOf("\n");
		while (index >= 0) {
			lines.push(buffer.slice(0, index));
			buffer = buffer.slice(index + 1);
			index = buffer.indexOf("\n");
		}
		notify?.();
	});
	return {
		lines: () => lines,
		waitFor(match: string): Promise<string> {
			return new Promise((resolve) => {
				const check = (): void => {
					const found = lines.find((line) => line.includes(match));
					if (found) {
						resolve(found);
						return;
					}
					notify = check;
				};
				check();
			});
		},
	};
}

// Integration assertions live in a single test: bun does not reliably deliver
// connections to a second net.Server created after a previous server was
// stopped in the same test process.
describe("pi-tui-rpc hub", () => {
	test("fanout, hello, dead-client pruning, and parse errors on one hub", async () => {
		const socketPath = path.join(os.tmpdir(), `pi-tui-rpc-test-${process.pid}-${Date.now()}.sock`);
		const seen: unknown[] = [];
		const hub = createHub({
			socketPath,
			onConnect: (_clientId, reply) => {
				reply({ type: "hello", v: 0, pid: process.pid, lease: "tui" });
			},
			onLine: (_clientId, value) => {
				seen.push(value);
			},
		});
		await hub.start();

		// Hello on connect, fanout to every client.
		const clientA = await connect(socketPath);
		const readerA = readLines(clientA);
		const helloA = await readerA.waitFor('"hello"');
		expect(JSON.parse(helloA).v).toBe(0);

		const clientB = await connect(socketPath);
		const readerB = readLines(clientB);
		await readerB.waitFor('"hello"');
		expect(hub.clientCount()).toBe(2);

		hub.broadcast({ type: "lease", owner: "tui", reason: "test" });
		await readerA.waitFor('"reason":"test"');
		await readerB.waitFor('"reason":"test"');

		// Dead clients are pruned without disturbing the fanout.
		clientB.destroy();
		await new Promise((resolve) => setTimeout(resolve, 50));
		expect(hub.clientCount()).toBe(1);
		hub.broadcast({ type: "lease", owner: "remote", reason: "after_prune" });
		await readerA.waitFor("after_prune");

		// Malformed lines answer with a parse error; valid lines reach onLine.
		clientA.write("this is not json\n");
		const errorLine = await readerA.waitFor('"parse"');
		expect(JSON.parse(errorLine).success).toBe(false);
		clientA.write('{"type":"abort"}\n');
		for (let i = 0; i < 20 && seen.length === 0; i++) {
			await new Promise((resolve) => setTimeout(resolve, 25));
		}
		expect(seen).toEqual([{ type: "abort" }]);

		clientA.destroy();
		await hub.stop();
		// The socket file is cleaned up on stop.
		expect(fs.existsSync(socketPath)).toBe(false);
	});
});

import { expect, test } from "bun:test";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import extension from "./index";

type Frame = Record<string, unknown>;
type Handler = (event: Frame, ctx: unknown) => Promise<unknown>;
function client(socketPath: string) {
	const socket = net.connect(socketPath);
	const frames: Frame[] = [];
	let buffer = "";
	socket.setEncoding("utf8");
	socket.on("data", (chunk: string) => {
		buffer += chunk;
		let boundary = buffer.indexOf("\n");
		while (boundary >= 0) {
			frames.push(JSON.parse(buffer.slice(0, boundary)) as Frame);
			buffer = buffer.slice(boundary + 1);
			boundary = buffer.indexOf("\n");
		}
	});
	const wait = async (predicate: (frame: Frame) => boolean): Promise<Frame> => {
		const deadline = Date.now() + 2000;
		for (;;) {
			const frame = frames.find(predicate);
			if (frame) return frame;
			if (Date.now() >= deadline) throw new Error("synthetic socket deadline");
			await Bun.sleep(1);
		}
	};
	let seq = 0;
	return {
		socket,
		wait,
		async command(type: string, args: Frame = {}) {
			const id = `r${++seq}`;
			socket.write(`${JSON.stringify({ id, type, ...args })}\n`);
			return wait((frame) => frame.type === "response" && frame.id === id);
		},
	};
}

test("real extension sockets fence controllers, disconnect, terminal reclaim and no-UI denial", async () => {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), "pi-control-"));
	const socketPath = path.join(root, "control.sock");
	const previous = process.env.PI_TUI_RPC_SOCKET;
	process.env.PI_TUI_RPC_SOCKET = socketPath;
	const handlers = new Map<string, Handler>();
	const sent: string[] = [];
	let confirmations = 0;
	let confirm: () => Promise<boolean> = async () => true;
	const ctx = {
		cwd: root,
		hasUI: true,
		isIdle: () => true,
		ui: {
			setStatus() {},
			confirm: async () => {
				confirmations++;
				return confirm();
			},
		},
		sessionManager: {
			getSessionFile: () => path.join(root, "native.jsonl"),
			getSessionId: () => "synthetic-native",
			getBranch: () => [],
		},
	};
	const pi = {
		on: (name: string, handler: Handler) => {
			handlers.set(name, handler);
			return () => {};
		},
		getSessionName: () => "synthetic",
		getThinkingLevel: () => "off",
		sendUserMessage: (message: string) => {
			sent.push(message);
		},
	};
	const emit = async (name: string, event: Frame = {}) => {
		const handler = handlers.get(name);
		if (!handler) throw new Error("missing synthetic handler");
		return handler(event, ctx);
	};
	let a: ReturnType<typeof client> | undefined;
	let b: ReturnType<typeof client> | undefined;
	try {
		extension(pi as unknown as ExtensionAPI);
		await emit("session_start");
		a = client(socketPath);
		b = client(socketPath);
		expect((await a.wait((f) => f.type === "hello")).capabilities).toContain("connection_leases_v1");
		await b.wait((f) => f.type === "hello");
		expect((await a.command("lease", { action: "request" })).success).toBe(true);
		expect((await a.command("prompt", { message: "first" })).success).toBe(true);
		expect((await b.command("prompt", { message: "intruder" })).success).toBe(false);
		expect((await b.command("lease", { action: "release" })).success).toBe(false);
		expect((await b.command("lease", { action: "request" })).success).toBe(false);
		expect((await b.command("get_state")).success).toBe(true);
		expect(confirmations).toBe(1);
		await emit("input", { source: "interactive", text: "terminal" });
		expect((await a.command("abort")).success).toBe(false);
		expect((await b.command("lease", { action: "request" })).success).toBe(true);
		expect((await b.command("prompt", { message: "second" })).success).toBe(true);
		b.socket.destroy();
		await a.wait((f) => f.type === "lease" && f.reason === "client_disconnect");
		let approve: (v: boolean) => void = () => {
			throw new Error("missing confirmation");
		};
		confirm = () =>
			new Promise<boolean>((resolve) => {
				approve = resolve;
			});
		const late = a.command("lease", { action: "request" });
		const deadline = Date.now() + 1000;
		while (confirmations < 3 && Date.now() < deadline) await Bun.sleep(1);
		expect(confirmations).toBe(3);
		await emit("input", { source: "interactive", text: "reclaim" });
		approve(true);
		expect((await late).success).toBe(false);
		ctx.hasUI = false;
		expect((await a.command("lease", { action: "request" })).success).toBe(false);
		expect(confirmations).toBe(3);
		expect(sent).toEqual(["first", "second"]);
	} finally {
		a?.socket.destroy();
		b?.socket.destroy();
		if (handlers.has("session_shutdown")) await emit("session_shutdown");
		if (previous === undefined) delete process.env.PI_TUI_RPC_SOCKET;
		else process.env.PI_TUI_RPC_SOCKET = previous;
		fs.rmSync(root, { recursive: true, force: true });
	}
});

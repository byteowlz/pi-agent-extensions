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

test("opt-in confirmation: real sockets fence controllers, disconnect, terminal reclaim and no-UI denial", async () => {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), "pi-control-"));
	const socketPath = path.join(root, "control.sock");
	const previous = process.env.PI_TUI_RPC_SOCKET;
	const previousConfirm = process.env.PI_TUI_RPC_LEASE_CONFIRM;
	process.env.PI_TUI_RPC_SOCKET = socketPath;
	process.env.PI_TUI_RPC_LEASE_CONFIRM = "1";
	const handlers = new Map<string, Handler>();
	const sent: string[] = [];
	let confirmations = 0;
	let nativeLeaf: string | null = "native-entry-a";
	let confirm: () => Promise<boolean> = async () => true;
	const ctx = {
		cwd: root,
		hasUI: true,
		isIdle: () => true,
		getContextUsage: () => ({ tokens: 42, contextWindow: 100 }),
		ui: {
			setStatus() {
				/* Status rendering is not part of this socket fixture. */
			},
			confirm: async () => {
				confirmations++;
				return confirm();
			},
		},
		sessionManager: {
			getSessionFile: () => path.join(root, "native.jsonl"),
			getSessionId: () => "synthetic-native",
			getLeafId: () => nativeLeaf,
			getBranch: () => [{ type: "message", message: { role: "assistant", content: [{ type: "text", text: " synthetic " }] } }],
			getEntries: () => [
				{ type: "message", message: { role: "user" } },
				{
					type: "message",
					message: {
						role: "assistant",
						content: [{ type: "toolCall" }],
						usage: { input: 1, output: 2, cacheRead: 3, cacheWrite: 4, cost: { total: 0.5 } },
					},
				},
				{ type: "message", message: { role: "toolResult" } },
				{ type: "branch_summary", usage: { input: 5, output: 0, cacheRead: 0, cacheWrite: 0 } },
			],
		},
	};
	const pi = {
		on: (name: string, handler: Handler) => {
			handlers.set(name, handler);
			return () => {
				/* The fixture map is discarded at shutdown. */
			};
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
		const state = await b.command("get_state");
		expect(state.success).toBe(true);
		expect((state.data as Frame).leafId).toBe("native-entry-a");
		nativeLeaf = "native-entry-b";
		expect(((await b.command("get_state")).data as Frame).leafId).toBe("native-entry-b");
		nativeLeaf = null;
		expect(((await b.command("get_state")).data as Frame).leafId).toBeNull();
		expect(((await b.command("get_last_assistant_text")).data as Frame).text).toBe("synthetic");
		const stats = (await b.command("get_session_stats")).data as Frame;
		expect(stats).toMatchObject({
			userMessages: 1,
			assistantMessages: 1,
			toolCalls: 1,
			toolResults: 1,
			totalMessages: 3,
			tokens: { input: 6, output: 2, cacheRead: 3, cacheWrite: 4 },
			cost: 0.5,
			contextUsage: { tokens: 42, contextWindow: 100 },
		});
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
		if (previous === undefined) Reflect.deleteProperty(process.env, "PI_TUI_RPC_SOCKET");
		else process.env.PI_TUI_RPC_SOCKET = previous;
		if (previousConfirm === undefined) Reflect.deleteProperty(process.env, "PI_TUI_RPC_LEASE_CONFIRM");
		else process.env.PI_TUI_RPC_LEASE_CONFIRM = previousConfirm;
		fs.rmSync(root, { recursive: true, force: true });
	}
});

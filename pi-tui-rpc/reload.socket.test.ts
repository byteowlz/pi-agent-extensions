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
		for (let at = buffer.indexOf("\n"); at >= 0; at = buffer.indexOf("\n")) {
			frames.push(JSON.parse(buffer.slice(0, at)) as Frame);
			buffer = buffer.slice(at + 1);
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
		frames,
		wait,
		async command(type: string) {
			const id = `r${++seq}`;
			socket.write(`${JSON.stringify({ id, type })}\n`);
			return wait((frame) => frame.type === "response" && frame.id === id);
		},
	};
}

test("reload over the socket: queued while working, runs once idle, never sent to the model", async () => {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), "pi-reload-"));
	const socketPath = path.join(root, "reload.sock");
	const previous = process.env.PI_TUI_RPC_SOCKET;
	process.env.PI_TUI_RPC_SOCKET = socketPath;
	const handlers = new Map<string, Handler>();
	const commands = new Map<string, (args: string, ctx: unknown) => Promise<void>>();
	const modelInput: string[] = [];
	const notices: string[] = [];
	let streaming = true;
	const idleWaiters: Array<() => void> = [];
	let reloads = 0;
	const ctx = {
		cwd: root,
		hasUI: true,
		isIdle: () => !streaming,
		getContextUsage: () => undefined,
		ui: {
			setStatus() {
				/* Not part of this fixture. */
			},
			notify: (message: string) => {
				notices.push(message);
			},
			confirm: async () => true,
		},
		sessionManager: {
			getSessionFile: () => path.join(root, "native.jsonl"),
			getSessionId: () => "synthetic-native",
			getLeafId: () => "leaf",
			getBranch: () => [],
			getEntries: () => [],
		},
	};
	// What Pi gives a command handler: the same context plus waitForIdle/reload.
	const commandCtx = {
		...ctx,
		waitForIdle: () => (streaming ? new Promise<void>((resolve) => idleWaiters.push(resolve)) : Promise.resolve()),
		reload: async () => {
			reloads++;
			await handlers.get("session_shutdown")?.({ type: "session_shutdown", reason: "reload" }, ctx);
		},
	};
	const pi = {
		on: (name: string, handler: Handler) => {
			handlers.set(name, handler);
		},
		events: { on: () => () => undefined },
		getSessionName: () => "synthetic",
		getThinkingLevel: () => "off",
		registerCommand: (name: string, options: { handler: (args: string, ctx: unknown) => Promise<void> }) => {
			commands.set(name, options.handler);
		},
		// Pi runs a registered "/command" when asked to expand it, even mid-run.
		sendUserMessage: (message: string, options?: { expandPromptTemplates?: boolean }) => {
			const command = message.startsWith("/") ? commands.get(message.slice(1)) : undefined;
			if (command && options?.expandPromptTemplates) {
				void command("", commandCtx);
				return;
			}
			modelInput.push(message);
		},
	};
	let observer: ReturnType<typeof client> | undefined;
	let operator: ReturnType<typeof client> | undefined;
	try {
		extension(pi as unknown as ExtensionAPI);
		await handlers.get("session_start")?.({ type: "session_start" }, ctx);
		observer = client(socketPath);
		operator = client(socketPath);
		const hello = await operator.wait((frame) => frame.type === "hello");
		expect(hello.commands).toContain("reload");
		expect(hello.capabilities).toContain("reload_when_idle_v1");

		// Working: queued, no lease needed, nothing reaches the model.
		const queued = await operator.command("reload");
		expect(queued.success).toBe(true);
		expect(queued.data).toEqual({ reload: "queued" });
		await observer.wait(
			(frame) => frame.type === "event" && frame.event === "reload" && (frame.data as Frame).state === "queued"
		);
		expect(notices.some((n) => n.startsWith("Reload queued"))).toBe(true);
		expect((await operator.command("reload")).data).toEqual({ reload: "already_pending" });
		await Bun.sleep(20);
		expect(reloads).toBe(0);

		// The run ends: exactly one reload.
		streaming = false;
		for (const resolve of idleWaiters.splice(0)) resolve();
		const deadline = Date.now() + 2000;
		while (reloads === 0 && Date.now() < deadline) await Bun.sleep(2);
		expect(reloads).toBe(1);
		expect(modelInput).toEqual([]);
	} finally {
		observer?.socket.destroy();
		operator?.socket.destroy();
		await handlers.get("session_shutdown")?.({ type: "session_shutdown", reason: "quit" }, ctx);
		if (previous === undefined) Reflect.deleteProperty(process.env, "PI_TUI_RPC_SOCKET");
		else process.env.PI_TUI_RPC_SOCKET = previous;
		fs.rmSync(root, { recursive: true, force: true });
	}
});

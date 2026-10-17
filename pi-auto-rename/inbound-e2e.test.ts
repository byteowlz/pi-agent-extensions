/**
 * End-to-end: the real extension (pi-auto-rename) connected to a real Unix
 * socket speaking the Herdr protocol. Verifies that a sidebar rename flows into
 * the Pi session name while the canonical readable id is preserved, and that
 * the extension's own outbound push is not echoed back as user intent.
 */
import { expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { type Server, createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import autoRename from "./index";

const SESSION_ID = "synthetic-session-id";
const SESSION_FILE = `/synthetic/${SESSION_ID}.jsonl`;
const PANE_ID = "w7:p1";
const TAB_ID = "w7:t1";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Fake Herdr protocol host: subscribes streams and answers ownership requests. */
async function fakeHost() {
	const root = mkdtempSync(join(tmpdir(), "pi-e2e-herdr-"));
	const socketPath = join(root, "herdr.sock");
	const streams = new Set<import("node:net").Socket>();
	let buffer = "";
	const state = { paneCount: 1, sessionFile: SESSION_FILE };
	const server: Server = createServer((socket) => {
		socket.setEncoding("utf8");
		socket.on("data", (chunk: string) => {
			buffer += chunk;
			const lines = buffer.split("\n");
			buffer = lines.pop() ?? "";
			for (const line of lines) {
				if (!line.trim()) continue;
				const request = JSON.parse(line) as { id: string; method: string; params?: Record<string, unknown> };
				if (request.method === "events.subscribe") {
					streams.add(socket);
					socket.write(`${JSON.stringify({ id: request.id, result: { type: "subscription_started" } })}\n`);
					continue;
				}
				if (request.method === "pane.get") {
					socket.write(
						`${JSON.stringify({
							id: request.id,
							result: {
								pane: {
									pane_id: PANE_ID,
									tab_id: TAB_ID,
									agent_session: { kind: "path", value: state.sessionFile },
								},
							},
						})}\n`
					);
					continue;
				}
				if (request.method === "tab.get") {
					socket.write(
						`${JSON.stringify({
							id: request.id,
							result: { tab: { tab_id: request.params?.tab_id ?? TAB_ID, pane_count: state.paneCount } },
						})}\n`
					);
					continue;
				}
				socket.write(`${JSON.stringify({ id: request.id, result: {} })}\n`);
			}
		});
	});
	await new Promise<void>((resolve) => server.listen(socketPath, resolve));
	return {
		socketPath,
		get paneCount() {
			return state.paneCount;
		},
		set paneCount(value: number) {
			state.paneCount = value;
		},
		emit(label: string, tabId = TAB_ID) {
			const line = `${JSON.stringify({ event: "tab_renamed", data: { type: "tab_renamed", tab_id: tabId, label, workspace_id: "w7" } })}\n`;
			for (const socket of streams) socket.write(line);
		},
		close: async () => {
			for (const socket of streams) socket.destroy();
			await new Promise<void>((resolve) => server.close(() => resolve()));
			rmSync(root, { recursive: true, force: true });
		},
	};
}

function buildExtension() {
	const handlers: Record<string, ((event: unknown, ctx: ExtensionContext) => Promise<void>)[]> = {};
	let sessionName = "";
	let command: ((args: string, ctx: ExtensionContext) => Promise<void>) | undefined;
	const pi = {
		getSessionName: () => sessionName,
		setSessionName: (name: string) => {
			sessionName = name;
		},
		registerTool: () => undefined,
		registerCommand: (_name: string, options: { handler: (args: string, ctx: ExtensionContext) => Promise<void> }) => {
			command = options.handler;
		},
		on: (event: string, handler: (event: unknown, ctx: ExtensionContext) => Promise<void>) => {
			handlers[event] = handlers[event] ?? [];
			handlers[event].push(handler);
		},
	} as unknown as ExtensionAPI;
	return {
		pi,
		getSessionName: () => sessionName,
		setSessionName: (name: string) => {
			sessionName = name;
		},
		runCommand: async (args: string, ctx: ExtensionContext) => {
			if (!command) throw new Error("no command registered");
			await command(args, ctx);
		},
		fire: async (event: string, payload: unknown, ctx: ExtensionContext) => {
			for (const handler of handlers[event] ?? []) await handler(payload, ctx);
		},
	};
}

function ctxFor(cwd: string): ExtensionContext {
	return {
		hasUI: true,
		cwd,
		sessionManager: {
			getBranch: () => [],
			getSessionId: () => SESSION_ID,
			getSessionFile: () => SESSION_FILE,
		},
		modelRegistry: { getAll: () => [], find: () => undefined, getApiKeyAndHeaders: async () => ({ ok: false }) },
		model: undefined,
		ui: { notify: () => undefined, setStatus: () => undefined },
	} as unknown as ExtensionContext;
}

test("real extension: Herdr sidebar rename updates the Pi name and preserves the readable id", async () => {
	const host = await fakeHost();
	const cwd = mkdtempSync(join(tmpdir(), "pi-e2e-cwd-"));
	writeFileSync(
		join(cwd, "auto-rename.json"),
		JSON.stringify({
			enabled: true,
			readableIdSuffix: true,
			syncTabTitle: false,
			syncTabTitleInbound: true,
			prefix: "",
			prefixOnly: false,
		})
	);
	const previous = { ...process.env };
	process.env.HERDR_ENV = "1";
	process.env.HERDR_SOCKET_PATH = host.socketPath;
	process.env.HERDR_PANE_ID = PANE_ID;
	process.env.HERDR_TAB_ID = TAB_ID;
	const ext = buildExtension();
	try {
		autoRename(ext.pi);
		const ctx = ctxFor(cwd);
		await ext.fire("session_start", { reason: "startup" }, ctx);
		await sleep(120);

		// A user renames the tab in the Herdr sidebar.
		host.emit("Renamed From Sidebar");
		await sleep(200);
		const name = ext.getSessionName();
		expect(name.startsWith("Renamed From Sidebar [")).toBe(true);
		expect(/\s\[[a-z][a-z0-9-]*-[a-z][a-z0-9-]*-[a-z][a-z0-9-]*\]$/.test(name)).toBe(true);

		// A replayed label that already carries the canonical id must not duplicate it.
		const canonical = name.slice(name.lastIndexOf("[") + 1, -1);
		host.emit(`Another Name [${canonical}]`);
		await sleep(200);
		const next = ext.getSessionName();
		expect(next.startsWith("Another Name [")).toBe(true);
		expect(next.match(/\[/g)?.length).toBe(1);

		// An unowned tab rename never touches the session name.
		host.emit("Foreign", "w7:t99");
		await sleep(150);
		expect(ext.getSessionName()).toBe(next);

		// A shared tab is not uniquely owned.
		host.paneCount = 2;
		host.emit("Shared");
		await sleep(150);
		expect(ext.getSessionName()).toBe(next);

		// Shutdown must stop listening: further renames are ignored.
		await ext.fire("session_shutdown", {}, ctx);
		host.paneCount = 1;
		host.emit("After Shutdown");
		await sleep(150);
		expect(ext.getSessionName()).toBe(next);
	} finally {
		process.env.HERDR_ENV = previous.HERDR_ENV;
		process.env.HERDR_SOCKET_PATH = previous.HERDR_SOCKET_PATH;
		process.env.HERDR_PANE_ID = previous.HERDR_PANE_ID;
		process.env.HERDR_TAB_ID = previous.HERDR_TAB_ID;
		await host.close();
		rmSync(cwd, { recursive: true, force: true });
	}
});

test("real extension: /auto-rename sync toggles inbound listening at runtime", async () => {
	const host = await fakeHost();
	const cwd = mkdtempSync(join(tmpdir(), "pi-e2e-toggle-"));
	writeFileSync(
		join(cwd, "auto-rename.json"),
		JSON.stringify({ enabled: true, readableIdSuffix: true, syncTabTitle: false, syncTabTitleInbound: false })
	);
	const previous = { ...process.env };
	process.env.HERDR_ENV = "1";
	process.env.HERDR_SOCKET_PATH = host.socketPath;
	process.env.HERDR_PANE_ID = PANE_ID;
	process.env.HERDR_TAB_ID = TAB_ID;
	const ext = buildExtension();
	try {
		autoRename(ext.pi);
		const ctx = ctxFor(cwd);
		await ext.fire("session_start", { reason: "startup" }, ctx);
		await sleep(120);

		// Disabled: a host rename is ignored.
		host.emit("Before Toggle");
		await sleep(150);
		expect(ext.getSessionName()).toBe("");

		// Enable at runtime via the TUI command (no reload).
		await ext.runCommand("sync", ctx);
		await sleep(150);
		const saved = JSON.parse(readFileSync(join(cwd, "auto-rename.json"), "utf-8"));
		expect(saved.syncTabTitleInbound).toBe(true);
		host.emit("After Toggle");
		await sleep(200);
		expect(ext.getSessionName().startsWith("After Toggle [")).toBe(true);

		// Disable again: listening stops immediately.
		await ext.runCommand("sync", ctx);
		await sleep(150);
		expect(JSON.parse(readFileSync(join(cwd, "auto-rename.json"), "utf-8")).syncTabTitleInbound).toBe(false);
		const frozen = ext.getSessionName();
		host.emit("After Disable");
		await sleep(200);
		expect(ext.getSessionName()).toBe(frozen);
	} finally {
		process.env.HERDR_ENV = previous.HERDR_ENV;
		process.env.HERDR_SOCKET_PATH = previous.HERDR_SOCKET_PATH;
		process.env.HERDR_PANE_ID = previous.HERDR_PANE_ID;
		process.env.HERDR_TAB_ID = previous.HERDR_TAB_ID;
		await host.close();
		rmSync(cwd, { recursive: true, force: true });
	}
});

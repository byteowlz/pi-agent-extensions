import { expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { type Server, createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { HerdrInboundTarget } from "./tab-title-inbound.js";

const SESSION_FILE = "/synthetic/session.jsonl";
const PANE_ID = "w9:p1";
const TAB_ID = "w9:t1";

interface FakeHerdr {
	server: Server;
	socketPath: string;
	requests: string[];
	/** Ownership the fake host reports. */
	paneOwner: { pane_id: string; tab_id: string; sessionFile: string };
	paneCount: number;
	subscribed: string[];
	emit(event: unknown): void;
	close(): Promise<void>;
}

/** Minimal Herdr protocol server: answers requests, streams subscribed events. */
async function fakeHerdr(): Promise<FakeHerdr> {
	const root = mkdtempSync(join(tmpdir(), "pi-inbound-herdr-"));
	const socketPath = join(root, "herdr.sock");
	const requests: string[] = [];
	const subscribed: string[] = [];
	const streams = new Set<import("node:net").Socket>();
	let buffer = "";
	const state = {
		paneOwner: { pane_id: PANE_ID, tab_id: TAB_ID, sessionFile: SESSION_FILE },
		paneCount: 1,
	};
	const server = createServer((socket) => {
		socket.setEncoding("utf8");
		socket.on("data", (chunk: string) => {
			buffer += chunk;
			const lines = buffer.split("\n");
			buffer = lines.pop() ?? "";
			for (const line of lines) {
				if (!line.trim()) continue;
				const request = JSON.parse(line) as { id: string; method: string; params?: Record<string, unknown> };
				requests.push(request.method);
				if (request.method === "events.subscribe") {
					subscribed.push(JSON.stringify(request.params));
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
									pane_id: state.paneOwner.pane_id,
									tab_id: state.paneOwner.tab_id,
									agent_session: { kind: "path", value: state.paneOwner.sessionFile },
								},
							},
						})}\n`
					);
					continue;
				}
				if (request.method === "tab.get") {
					const tabId = (request.params?.tab_id as string) ?? "";
					socket.write(
						`${JSON.stringify({
							id: request.id,
							result: { tab: { tab_id: tabId, pane_count: state.paneCount } },
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
		server,
		socketPath,
		requests,
		subscribed,
		get paneOwner() {
			return state.paneOwner;
		},
		set paneOwner(value) {
			state.paneOwner = value;
		},
		get paneCount() {
			return state.paneCount;
		},
		set paneCount(value) {
			state.paneCount = value;
		},
		emit(event: unknown) {
			const line = `${JSON.stringify(event)}\n`;
			for (const socket of streams) socket.write(line);
		},
		close: async () => {
			for (const socket of streams) socket.destroy();
			await new Promise<void>((resolve) => server.close(() => resolve()));
			rmSync(root, { recursive: true, force: true });
		},
	};
}

const renameEvent = (label: string, tabId = TAB_ID) => ({
	event: "tab_renamed",
	data: { type: "tab_renamed", tab_id: tabId, label, workspace_id: "w9" },
});

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

test("Herdr inbound subscribes to tab.renamed and applies owned renames", async () => {
	const host = await fakeHerdr();
	const applied: string[] = [];
	const { EchoSuppressor } = await import("./tab-title-inbound.js");
	const target = new HerdrInboundTarget(
		{
			readableId: "mini-okay-soda",
			sessionFile: SESSION_FILE,
			env: { HERDR_ENV: "1", HERDR_SOCKET_PATH: host.socketPath, HERDR_PANE_ID: PANE_ID },
			apply: (base) => {
				applied.push(base);
			},
		},
		new EchoSuppressor(),
		await makeRequester(host.socketPath)
	);
	try {
		target.start();
		await sleep(80);
		expect(host.subscribed.some((s) => s.includes("tab.renamed"))).toBe(true);
		host.emit(renameEvent("Renamed From Sidebar"));
		await sleep(120);
		expect(applied).toEqual(["Renamed From Sidebar"]);
		target.stop();
	} finally {
		await host.close();
	}
});

/** Build a request helper that speaks the fake socket directly. */
async function makeRequester(socketPath: string) {
	const net = await import("node:net");
	return (method: string, params: unknown) =>
		new Promise<unknown>((resolve, reject) => {
			const socket = net.createConnection(socketPath);
			let buffer = "";
			const timeout = setTimeout(() => {
				socket.destroy();
				reject(new Error("timeout"));
			}, 1000);
			socket.setEncoding("utf8");
			socket.on("error", reject);
			socket.on("connect", () => socket.write(`${JSON.stringify({ id: "t", method, params })}\n`));
			socket.on("data", (chunk: string) => {
				buffer += chunk;
				const index = buffer.indexOf("\n");
				if (index < 0) return;
				clearTimeout(timeout);
				const parsed = JSON.parse(buffer.slice(0, index)) as { result?: unknown };
				socket.destroy();
				resolve(parsed.result);
			});
		});
}

test("Herdr inbound rejects renames from tabs this session does not own", async () => {
	const host = await fakeHerdr();
	const applied: string[] = [];
	const target = new HerdrInboundTarget(
		{
			readableId: "mini-okay-soda",
			sessionFile: SESSION_FILE,
			env: { HERDR_ENV: "1", HERDR_SOCKET_PATH: host.socketPath, HERDR_PANE_ID: PANE_ID },
			apply: (base) => {
				applied.push(base);
			},
		},
		new (await import("./tab-title-inbound.js")).EchoSuppressor(),
		await makeRequester(host.socketPath)
	);
	try {
		target.start();
		await sleep(80);
		// Wrong tab id.
		host.emit(renameEvent("Other Tab", "w9:t99"));
		await sleep(80);
		expect(applied).toEqual([]);
		// Another session took the pane.
		host.paneOwner = { pane_id: PANE_ID, tab_id: TAB_ID, sessionFile: "/other/session.jsonl" };
		host.emit(renameEvent("Hijack"));
		await sleep(80);
		expect(applied).toEqual([]);
		// Shared tab (multiple panes) is not uniquely owned.
		host.paneOwner = { pane_id: PANE_ID, tab_id: TAB_ID, sessionFile: SESSION_FILE };
		host.paneCount = 2;
		host.emit(renameEvent("Shared"));
		await sleep(80);
		expect(applied).toEqual([]);
		target.stop();
	} finally {
		await host.close();
	}
});

test("Herdr inbound ignores the echo of a title this process just pushed", async () => {
	const host = await fakeHerdr();
	const applied: string[] = [];
	const { EchoSuppressor } = await import("./tab-title-inbound.js");
	const suppressor = new EchoSuppressor(300);
	const target = new HerdrInboundTarget(
		{
			readableId: "mini-okay-soda",
			sessionFile: SESSION_FILE,
			env: { HERDR_ENV: "1", HERDR_SOCKET_PATH: host.socketPath, HERDR_PANE_ID: PANE_ID },
			apply: (base) => {
				applied.push(base);
			},
		},
		suppressor,
		await makeRequester(host.socketPath)
	);
	try {
		target.start();
		await sleep(80);
		target.notePushed("Pushed Title");
		host.emit(renameEvent("Pushed Title"));
		await sleep(120);
		expect(applied).toEqual([]);
		host.emit(renameEvent("Genuine User Rename"));
		await sleep(120);
		expect(applied).toEqual(["Genuine User Rename"]);
		target.stop();
	} finally {
		await host.close();
	}
});

/**
 * Inbound tab-title sync: host tab renames -> Pi session name.
 *
 * One-way outbound projection lives in ./tab-title.ts. This module is the
 * reverse direction, used by the `syncTabTitleInbound` option.
 *
 * Safety model:
 * - Opt-in. Nothing is subscribed unless the operator enables it.
 * - Ownership is verified every time: the event must originate from the tab
 *   that currently belongs to this session (single pane, matching session file).
 * - Echo suppression: titles this extension just pushed to the host are
 *   recorded and ignored when they come back as renames.
 * - The canonical readable id is never dropped. A host label replaces the
 *   *base* name; the current canonical suffix is re-appended.
 * - Hosts are best-effort. Missing/broken hosts must never break Pi renaming.
 */

import net from "node:net";

export type ApplyInbound = (base: string) => Promise<void> | void;

export interface InboundContext {
	/** Canonical readable id for this session, if any. */
	readableId?: string;
	/** Session file currently owned by this pane, used for ownership checks. */
	sessionFile?: string;
}

export interface InboundSyncOptions extends InboundContext {
	env?: NodeJS.ProcessEnv;
	/** Debounce window for echo suppression, ms. */
	echoWindowMs?: number;
	/** Called with the incoming base name (no readable id) when it is accepted. */
	apply: ApplyInbound;
}

export interface InboundTarget {
	start(): void;
	stop(): void;
	/** Record a title this process just pushed, so the host echo is ignored. */
	notePushed(title: string): void;
}

const DEFAULT_ECHO_WINDOW_MS = 1500;
const MAX_TITLE_LENGTH = 200;
const SOCKET_TIMEOUT_MS = 1000;

/** Strip control characters and bound length; never accept empty labels. */
export function normalizeInboundLabel(label: string | undefined | null, max = MAX_TITLE_LENGTH): string | null {
	if (typeof label !== "string") return null;
	const cleaned = Array.from(label.replace(/\p{Cc}/gu, " "))
		.join("")
		.replace(/\s+/g, " ")
		.trim();
	if (!cleaned) return null;
	return Array.from(cleaned).slice(0, max).join("");
}

/**
 * Map a host tab label onto a Pi base name.
 *
 * The label is presentation-only input: it replaces the title, but any
 * readable id already present in the incoming label is stripped first so the
 * canonical one is never duplicated or spoofed.
 */
export function inboundBaseName(label: string, readableId: string | undefined): string | null {
	let value = label;
	if (readableId && value.endsWith(` [${readableId}]`)) value = value.slice(0, -readableId.length - 3);
	// Strip any *other* readable-id-shaped suffix so a host cannot inject one.
	value = value.replace(/\s\[[a-z][a-z0-9-]*-[a-z][a-z0-9-]*-[a-z][a-z0-9-]*\]$/i, "").trim();
	return value || null;
}

/** Tracks recently pushed titles so host echoes are not treated as user intent. */
export class EchoSuppressor {
	private readonly pushed = new Map<string, number>();
	private readonly windowMs: number;

	constructor(windowMs = DEFAULT_ECHO_WINDOW_MS) {
		this.windowMs = windowMs;
	}

	note(title: string): void {
		this.pushed.set(title, Date.now());
	}

	/** True when the label matches a title pushed within the window. */
	matches(title: string): boolean {
		const at = this.pushed.get(title);
		if (at === undefined) return false;
		if (Date.now() - at > this.windowMs) {
			this.pushed.delete(title);
			return false;
		}
		return true;
	}

	clear(): void {
		this.pushed.clear();
	}
}

type PaneInfo = { pane_id?: string; tab_id?: string; agent_session?: { kind?: string; value?: string } };
type TabInfo = { tab_id?: string; pane_count?: number };

interface HerdrLine {
	id?: string;
	event?: string;
	data?: { type?: string; tab_id?: string; label?: string };
	result?: { type?: string };
	error?: unknown;
}

/**
 * Herdr inbound sync over the socket API.
 *
 * Uses `events.subscribe` with `tab.renamed`, the same socket the installed
 * herdr pi integration already talks to. No Herdr core changes required.
 */
export class HerdrInboundTarget implements InboundTarget {
	private socket: net.Socket | undefined;
	private buffer = "";
	private closed = false;
	private reconnecting: ReturnType<typeof setTimeout> | undefined;

	constructor(
		private readonly options: InboundSyncOptions,
		private readonly suppress: EchoSuppressor,
		private readonly request: (method: string, params: unknown) => Promise<unknown>
	) {}

	private get env(): NodeJS.ProcessEnv {
		return this.options.env ?? process.env;
	}

	start(): void {
		if (this.socket || this.closed) return;
		const socketPath = this.env.HERDR_SOCKET_PATH;
		if (this.env.HERDR_ENV !== "1" || !socketPath || !this.env.HERDR_PANE_ID) return;
		const endpoint = process.platform === "win32" ? `\\\\.\\pipe\\${socketPath}` : socketPath;
		const socket = net.createConnection(endpoint);
		this.socket = socket;
		socket.setEncoding("utf8");
		socket.on("connect", () => {
			socket.write(
				`${JSON.stringify({ id: "pi-auto-rename:inbound", method: "events.subscribe", params: { subscriptions: [{ type: "tab.renamed" }] } })}\n`
			);
		});
		socket.on("data", (chunk: string) => this.consume(chunk));
		socket.on("error", () => this.teardown(socket));
		socket.on("close", () => this.teardown(socket));
	}

	private teardown(socket: net.Socket): void {
		if (this.socket !== socket) return;
		this.socket = undefined;
		socket.destroy();
		if (this.closed || this.reconnecting) return;
		this.reconnecting = setTimeout(() => {
			this.reconnecting = undefined;
			this.start();
		}, SOCKET_TIMEOUT_MS);
		this.reconnecting.unref?.();
	}

	private consume(chunk: string): void {
		this.buffer += chunk;
		const lines = this.buffer.split("\n");
		this.buffer = lines.pop() ?? "";
		for (const line of lines) {
			if (!line.trim()) continue;
			let parsed: HerdrLine;
			try {
				parsed = JSON.parse(line) as HerdrLine;
			} catch {
				continue;
			}
			if (parsed.event !== "tab_renamed" || parsed.data?.type !== "tab_renamed") continue;
			void this.handleRename(parsed.data.tab_id, parsed.data.label);
		}
	}

	private async handleRename(tabId: string | undefined, rawLabel: string | undefined): Promise<void> {
		const label = normalizeInboundLabel(rawLabel);
		if (!tabId || !label) return;
		if (this.suppress.matches(label)) return;
		if (!(await this.ownsTab(tabId))) return;
		const base = inboundBaseName(label, this.options.readableId);
		if (!base) return;
		await this.options.apply(base);
	}

	/** Unwrap `{result:{key:…}}` envelopes and bare `{key:…}` shapes. */
	private static unwrap<T>(payload: unknown, key: string): T | undefined {
		if (!payload || typeof payload !== "object") return undefined;
		const envelope = payload as { result?: Record<string, unknown> };
		const scope = (envelope.result ?? payload) as Record<string, unknown>;
		return scope[key] as T | undefined;
	}

	/** Verify the event's tab is the live, single-pane tab owned by this session. */
	private async ownsTab(tabId: string): Promise<boolean> {
		const paneId = this.env.HERDR_PANE_ID;
		if (!paneId || !this.options.sessionFile) return false;
		try {
			const info = HerdrInboundTarget.unwrap<PaneInfo>(await this.request("pane.get", { pane_id: paneId }), "pane");
			if (
				!info ||
				info.pane_id !== paneId ||
				info.tab_id !== tabId ||
				info.agent_session?.kind !== "path" ||
				info.agent_session.value !== this.options.sessionFile
			)
				return false;
			const tabInfo = HerdrInboundTarget.unwrap<TabInfo>(await this.request("tab.get", { tab_id: tabId }), "tab");
			return Boolean(tabInfo && tabInfo.tab_id === tabId && tabInfo.pane_count === 1);
		} catch {
			return false;
		}
	}

	notePushed(title: string): void {
		this.suppress.note(title);
	}

	stop(): void {
		this.closed = true;
		if (this.reconnecting) {
			clearTimeout(this.reconnecting);
			this.reconnecting = undefined;
		}
		const socket = this.socket;
		this.socket = undefined;
		socket?.destroy();
		this.suppress.clear();
	}
}

/**
 * tmux inbound sync via the `window-renamed` hook.
 *
 * Registers a per-window hook that echoes `window_id|name` into a private
 * inbox file that this process tails. Hooks are removed on stop. The window
 * is verified to be the caller's own single-pane window before applying.
 */
export class TmuxInboundTarget implements InboundTarget {
	private timer: ReturnType<typeof setInterval> | undefined;
	private offset = 0;
	private windowId: string | undefined;

	constructor(
		private readonly options: InboundSyncOptions,
		private readonly suppress: EchoSuppressor,
		private readonly run: (args: string[]) => Promise<string>,
		private readonly inboxPath: string,
		private readonly readInbox: (path: string, from: number) => { text: string; offset: number }
	) {}

	async start(): Promise<void> {
		// start() is sync in the interface; discovery is best-effort and async.
		void this.bootstrap();
	}

	private async bootstrap(): Promise<void> {
		const env = this.options.env ?? process.env;
		const paneId = env.TMUX_PANE;
		if (!env.TMUX || !paneId || !/^%\d+$/.test(paneId)) return;
		try {
			const receipt = (await this.run(["display-message", "-p", "-t", paneId, "#{pane_id}|#{window_id}|#{window_panes}"])).trim();
			const [pane, window, count] = receipt.split("|");
			if (pane !== paneId || !/^@\d+$/.test(window ?? "") || count !== "1") return;
			this.windowId = window;
			const hook = `run-shell -b 'printf "%s\\\\n" "#{window_id}|#{window_name}" >> ${this.inboxPath}'`;
			await this.run(["set-hook", "-w", "-t", window, "window-renamed", hook]);
			this.timer = setInterval(() => this.poll(), 250);
			this.timer.unref?.();
		} catch {
			this.windowId = undefined;
		}
	}

	private poll(): void {
		let result: { text: string; offset: number };
		try {
			result = this.readInbox(this.inboxPath, this.offset);
		} catch {
			return;
		}
		this.offset = result.offset;
		for (const line of result.text.split("\n")) {
			if (!line.trim()) continue;
			const index = line.indexOf("|");
			if (index < 0) continue;
			const [window, label] = [line.slice(0, index), line.slice(index + 1)];
			if (window !== this.windowId) continue;
			void this.handleLabel(label);
		}
	}

	private async handleLabel(rawLabel: string): Promise<void> {
		const label = normalizeInboundLabel(rawLabel);
		if (!label || this.suppress.matches(label)) return;
		const base = inboundBaseName(label, this.options.readableId);
		if (!base) return;
		await this.options.apply(base);
	}

	notePushed(title: string): void {
		this.suppress.note(title);
	}

	stop(): void {
		this.suppress.clear();
		if (this.timer) {
			clearInterval(this.timer);
			this.timer = undefined;
		}
		const window = this.windowId;
		this.windowId = undefined;
		if (window) void this.run(["set-hook", "-uw", "-t", window, "window-renamed"]).catch(() => undefined);
	}
}

/** Select and wire the inbound target for the current host, if any. */
export function createInboundTarget(
	options: InboundSyncOptions,
	helpers: {
		run: (args: string[]) => Promise<string>;
		inboxPath: string;
		readInbox: (path: string, from: number) => { text: string; offset: number };
		request: (method: string, params: unknown) => Promise<unknown>;
	}
): InboundTarget | undefined {
	const env = options.env ?? process.env;
	const suppress = new EchoSuppressor(options.echoWindowMs);
	if (env.HERDR_ENV === "1" && env.HERDR_SOCKET_PATH) return new HerdrInboundTarget(options, suppress, helpers.request);
	if (env.TMUX_PANE) return new TmuxInboundTarget(options, suppress, helpers.run, helpers.inboxPath, helpers.readInbox);
	return undefined;
}

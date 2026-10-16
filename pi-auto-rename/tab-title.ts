import { execFile } from "node:child_process";

export type TitleCommand = (program: string, args: string[], signal: AbortSignal, env?: NodeJS.ProcessEnv) => Promise<string>;
export interface TabTitleRequest {
	name: string;
	readableId?: string;
	sessionFile?: string;
	env: NodeJS.ProcessEnv;
}

/** Presentation only: never mutate the canonical Pi name or infer identity from a label. */
export function tabTitle(name: string, readableId?: string): string {
	let title = name.trim();
	if (readableId && title.endsWith(` [${readableId}]`)) title = title.slice(0, -readableId.length - 3);
	return Array.from(
		title
			.replace(/^(?:\[(?:sub|side)\]\s*)+/i, "")
			.replace(/\p{Cc}/gu, " ")
			.trim()
	)
		.slice(0, 200)
		.join("");
}

const execute: TitleCommand = (program, args, signal, env) =>
	new Promise((resolve, reject) => {
		execFile(program, args, { timeout: 1000, maxBuffer: 64 * 1024, signal, env }, (error, stdout) => {
			if (error) reject(error);
			else resolve(stdout);
		});
	});

type PaneInfo = { pane_id?: string; tab_id?: string; agent_session?: { kind?: string; value?: string } };
type TabInfo = { tab_id?: string; pane_count?: number };
function result<T>(text: string, key: string): T | undefined {
	const value = JSON.parse(text) as { error?: unknown; result?: Record<string, T> };
	if (value.error) return undefined;
	return value.result?.[key];
}

async function syncHerdr(input: TabTitleRequest, title: string, run: TitleCommand, signal: AbortSignal): Promise<boolean> {
	const paneId = input.env.HERDR_PANE_ID;
	if (!paneId || !input.env.HERDR_SOCKET_PATH || !input.sessionFile) return false;
	const pane = result<PaneInfo>(await run("herdr", ["pane", "get", paneId], signal, input.env), "pane");
	if (
		signal.aborted ||
		!pane ||
		pane.pane_id !== paneId ||
		!pane.tab_id ||
		!pane.agent_session ||
		pane.agent_session.kind !== "path" ||
		pane.agent_session.value !== input.sessionFile
	)
		return false;
	const tab = result<TabInfo>(await run("herdr", ["tab", "get", pane.tab_id], signal, input.env), "tab");
	// A shared tab has no unique owner. Don't let independent sessions fight over it.
	if (signal.aborted || !tab || tab.tab_id !== pane.tab_id || tab.pane_count !== 1) return false;
	const live = result<PaneInfo>(await run("herdr", ["pane", "get", paneId], signal, input.env), "pane");
	if (
		signal.aborted ||
		!live ||
		live.tab_id !== pane.tab_id ||
		live.pane_id !== paneId ||
		!live.agent_session ||
		live.agent_session.value !== input.sessionFile ||
		live.agent_session.kind !== "path"
	)
		return false;
	await run("herdr", ["tab", "rename", pane.tab_id, title], signal, input.env);
	return true;
}

async function syncTmux(input: TabTitleRequest, title: string, run: TitleCommand, signal: AbortSignal): Promise<boolean> {
	const paneId = input.env.TMUX_PANE;
	if (!input.env.TMUX || !paneId || !/^%\d+$/.test(paneId)) return false;
	const args = ["display-message", "-p", "-t", paneId, "#{pane_id}|#{window_id}|#{window_panes}"];
	const receipt = (await run("tmux", args, signal, input.env)).trim();
	const [pane, window, count] = receipt.split("|");
	if (signal.aborted || pane !== paneId || !/^@\d+$/.test(window ?? "") || count !== "1") return false;
	if ((await run("tmux", args, signal, input.env)).trim() !== receipt || signal.aborted) return false;
	await run("tmux", ["rename-window", "-t", window, title], signal, input.env);
	return true;
}

/** Serialized, abortable best-effort projection. No focused-host fallback. */
export class TabTitleSync {
	private controller = new AbortController();
	private pending: Promise<void> = Promise.resolve();
	private revision = 0;

	constructor(private readonly run: TitleCommand = execute) {}

	reset(): void {
		this.controller.abort();
		this.controller = new AbortController();
	}

	update(input: TabTitleRequest): Promise<void> {
		const signal = this.controller.signal;
		const revision = ++this.revision;
		const snapshot = { ...input, env: { ...input.env } };
		this.pending = this.pending
			.then(async () => {
				if (signal.aborted || revision !== this.revision) return;
				const title = tabTitle(snapshot.name, snapshot.readableId);
				if (!title) return;
				if (snapshot.env.HERDR_ENV === "1") await syncHerdr(snapshot, title, this.run, signal);
				else await syncTmux(snapshot, title, this.run, signal);
			})
			.catch(() => {
				/* Missing hosts, stale claims and timeout must never break Pi renaming. */
			});
		return this.pending;
	}
}

import { expect, test } from "bun:test";
import type { Theme } from "@earendil-works/pi-coding-agent";
import type { TUI } from "@earendil-works/pi-tui";
import { DEFAULT_CONFIG } from "./config.js";
import type { HistoryHit } from "./indexer.js";
import { HistoryOverlay } from "./overlay.js";
import type { HistoryWorker } from "./worker.js";

const pause = () => new Promise((resolve) => setTimeout(resolve, 100));
function fixture() {
	const calls: { resolve: (value: HistoryHit[]) => void; signal: AbortSignal }[] = [];
	let closed = 0;
	const worker = {
		call: (_method: string, _args: unknown[], signal: AbortSignal) =>
			new Promise<HistoryHit[]>((resolve) => {
				calls.push({ resolve, signal });
			}),
	} as unknown as HistoryWorker;
	const overlay = new HistoryOverlay(
		() => closed++,
		{ requestRender: () => undefined } as unknown as TUI,
		{ fg: (_color: string, text: string) => text, bold: (text: string) => text } as unknown as Theme,
		{ base: "/synthetic", dir: "/synthetic/project", config: DEFAULT_CONFIG, worker }
	);
	return { overlay, calls, closed: () => closed };
}
function hit(title: string): HistoryHit {
	return { sessionId: title, title, sessionName: title, project: "fixture", timestamp: "2026-01-01T00:00:00Z", matches: [] };
}

test("overlay debounces typing and closing cancels without starting delayed work", async () => {
	const f = fixture();
	f.overlay.handleInput("a");
	f.overlay.handleInput("b");
	expect(f.calls).toHaveLength(0);
	f.overlay.handleInput("\x1b");
	await pause();
	expect(f.closed()).toBe(1);
	expect(f.calls).toHaveLength(0);
});

test("late worker results cannot overwrite newer query or a closed overlay", async () => {
	const f = fixture();
	await pause();
	f.overlay.handleInput("a");
	await pause();
	expect(f.calls[0].signal.aborted).toBe(true);
	f.calls[1].resolve([hit("NEW RESULT")]);
	await Promise.resolve();
	f.calls[0].resolve([hit("OLD RESULT")]);
	await Promise.resolve();
	const rendered = f.overlay.render(100).join("\n");
	expect(rendered).toContain("NEW RESULT");
	expect(rendered).not.toContain("OLD RESULT");
	f.overlay.handleInput("b");
	await pause();
	f.overlay.dispose();
	expect(f.calls[2].signal.aborted).toBe(true);
	f.calls[2].resolve([hit("AFTER CLOSE")]);
	await Promise.resolve();
	expect(f.overlay.render(100).join("\n")).not.toContain("AFTER CLOSE");
});

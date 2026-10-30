/**
 * pi-schedule — agent wake-ups ("sleep"): one-shot timers the AGENT sets.
 *
 * A wake-up is the agent-facing sibling of a scheduled action: instead of the
 * user arming a recurring check, the model calls the `sleep` tool, its turn
 * ends (`terminate: true`, no follow-up model call), and one timer later a
 * "[wake-up]" message is delivered into the same session — with full context,
 * which is what a `sleep 1200` bash command can never do (it only burns the
 * tool-timeout budget and keeps the turn alive).
 *
 * Store: `~/.pi/agent/schedule/wakes/<sessionId>.json`, same conventions as the
 * schedule stores. The store only ever holds PENDING wakes: firing removes the
 * entry (the delivered message is the record, the session transcript keeps it),
 * and a wake whose time passed while the session was closed is delivered late
 * on the next start, labelled with its delay — the catch-up path mirrors the
 * inbox queue. Forks get a new session id and do not inherit wakes.
 *
 * Permission modes (`pi-schedule.json` -> `sleep.mode`):
 *   "off"   tool is deactivated; the model never sees it
 *   "allow" the agent uses it freely (default; caps are the guardrails)
 *   "ask"   every call is confirmed through the UI; no UI fails closed
 */

import * as fs from "node:fs";
import { existsSync, readFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { MIN_INTERVAL_MS, formatDuration, formatInterval, parseInterval, scheduleDir } from "./schedule.js";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export type SleepMode = "off" | "allow" | "ask";

export interface SleepConfig {
	/** "off" hides the tool, "allow" lets the agent use it freely, "ask" confirms every call. */
	mode: SleepMode;
	/** Shortest accepted sleep. parseInterval's own floor (10s) applies regardless. */
	minDurationMs: number;
	/** Longest accepted sleep; bounds how far into the future a wake can be pushed. */
	maxDurationMs: number;
	/** Most pending wakes at once; caps timer and wake-up-message spam. */
	maxPending: number;
}

export const DEFAULT_SLEEP_CONFIG: SleepConfig = {
	mode: "allow",
	minDurationMs: MIN_INTERVAL_MS,
	maxDurationMs: 24 * 3_600_000,
	maxPending: 3,
};

const MODES: readonly SleepMode[] = ["off", "allow", "ask"];

function isRecord(value: unknown): value is Record<string, unknown> {
	return !!value && typeof value === "object" && !Array.isArray(value);
}

/** Config lives in pi-schedule.json (./ , ./.pi/ , ~/.pi/agent/ — first match wins). */
export function loadSleepConfig(cwd: string): SleepConfig {
	const home = os.homedir();
	const candidates = [path.join(cwd, "pi-schedule.json"), path.join(cwd, ".pi", "pi-schedule.json")];
	if (home) candidates.push(path.join(home, ".pi", "agent", "pi-schedule.json"));
	const cfg = { ...DEFAULT_SLEEP_CONFIG };
	for (const file of candidates) {
		if (!existsSync(file)) continue;
		try {
			const parsed = JSON.parse(readFileSync(file, "utf-8")) as unknown;
			const sleep = isRecord(parsed) && isRecord(parsed.sleep) ? parsed.sleep : undefined;
			if (!sleep) continue;
			if (typeof sleep.mode === "string" && (MODES as readonly string[]).includes(sleep.mode)) cfg.mode = sleep.mode as SleepMode;
			if (typeof sleep.minDurationMs === "number" && sleep.minDurationMs >= 1000) cfg.minDurationMs = sleep.minDurationMs;
			if (typeof sleep.maxDurationMs === "number" && sleep.maxDurationMs >= cfg.minDurationMs)
				cfg.maxDurationMs = sleep.maxDurationMs;
			if (typeof sleep.maxPending === "number" && Number.isInteger(sleep.maxPending) && sleep.maxPending >= 1)
				cfg.maxPending = sleep.maxPending;
		} catch {
			// malformed config keeps defaults; the file may be mid-edit
		}
		break; // first match wins
	}
	return cfg;
}

/** Validate a duration argument against the config (parse + clamp). */
export function resolveDuration(raw: string, config: SleepConfig): { durationMs: number } | { error: string } {
	const parsed = parseInterval(raw);
	if ("error" in parsed) return parsed;
	if (parsed.intervalMs < config.minDurationMs)
		return {
			error: `sleep too short: minimum is ${formatDuration(config.minDurationMs)} (sleep.minDurationMs in pi-schedule.json)`,
		};
	if (parsed.intervalMs > config.maxDurationMs)
		return {
			error: `sleep too long: maximum is ${formatDuration(config.maxDurationMs)} (sleep.maxDurationMs in pi-schedule.json)`,
		};
	return { durationMs: parsed.intervalMs };
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export interface Wake {
	/** "sleep-1", "sleep-2", ... — stable, selectable on the command line. */
	id: string;
	/** Message carried into the wake-up; empty means none was set. */
	note: string;
	durationMs: number;
	createdAt: string;
	/** ISO timestamp the timer is due; firing removes the entry. */
	fireAt: string;
}

export interface WakeStore {
	version: 1;
	wakes: Wake[];
	updatedAt?: string;
}

export function wakeStorePath(sessionId: string, agentDir?: string): string {
	const safe = sessionId.replace(/[^A-Za-z0-9._-]+/g, "_");
	return path.join(scheduleDir(agentDir), "wakes", `${safe}.json`);
}

function parseWake(raw: unknown): Wake | undefined {
	if (!isRecord(raw)) return undefined;
	const { id, note, durationMs, fireAt } = raw;
	if (typeof id !== "string" || !id) return undefined;
	if (typeof note !== "string") return undefined;
	if (typeof durationMs !== "number" || !Number.isFinite(durationMs) || durationMs <= 0) return undefined;
	if (typeof fireAt !== "string" || !fireAt || !Number.isFinite(Date.parse(fireAt))) return undefined;
	return {
		id,
		note,
		durationMs,
		fireAt,
		createdAt: typeof raw.createdAt === "string" ? raw.createdAt : "",
	};
}

export function readWakes(sessionId: string, agentDir?: string): Wake[] {
	try {
		const parsed = JSON.parse(fs.readFileSync(wakeStorePath(sessionId, agentDir), "utf-8")) as unknown;
		if (!isRecord(parsed) || parsed.version !== 1 || !Array.isArray(parsed.wakes)) return [];
		return parsed.wakes.map(parseWake).filter((wake): wake is Wake => wake !== undefined);
	} catch {
		return [];
	}
}

function writeWakes(sessionId: string, wakes: Wake[], agentDir?: string): string {
	const file = wakeStorePath(sessionId, agentDir);
	fs.mkdirSync(path.dirname(file), { recursive: true });
	const store: WakeStore = { version: 1, wakes, updatedAt: new Date().toISOString() };
	const staged = `${file}.tmp-${process.pid}`;
	fs.writeFileSync(staged, `${JSON.stringify(store, null, 2)}\n`);
	fs.renameSync(staged, file);
	return file;
}

/** First free "sleep-<n>" id. */
export function nextWakeId(existing: readonly Wake[]): string {
	const taken = new Set(existing.map((wake) => wake.id));
	let n = 1;
	while (taken.has(`sleep-${n}`)) n += 1;
	return `sleep-${n}`;
}

export function addWake(
	sessionId: string,
	input: { note: string; durationMs: number; now?: number },
	agentDir?: string
): { wakes: Wake[]; wake: Wake } {
	const now = input.now ?? Date.now();
	const wakes = readWakes(sessionId, agentDir);
	const wake: Wake = {
		id: nextWakeId(wakes),
		note: input.note.trim(),
		durationMs: input.durationMs,
		createdAt: new Date(now).toISOString(),
		fireAt: new Date(now + input.durationMs).toISOString(),
	};
	const next = [...wakes, wake];
	writeWakes(sessionId, next, agentDir);
	return { wakes: next, wake };
}

/** Resolve by 1-based index, exact id, or unique id prefix ("2", "sleep-2", "sl"). */
export function findWake(wakes: readonly Wake[], selector: string): Wake | undefined {
	const value = selector.trim();
	if (!value) return undefined;
	const index = Number.parseInt(value, 10);
	if (Number.isInteger(index) && String(index) === value) return wakes[index - 1];
	const exact = wakes.find((wake) => wake.id === value);
	if (exact) return exact;
	const matches = wakes.filter((wake) => wake.id.startsWith(value));
	return matches.length === 1 ? matches[0] : undefined;
}

export function removeWake(sessionId: string, selector: string, agentDir?: string): { removed?: Wake; wakes: Wake[] } {
	const wakes = readWakes(sessionId, agentDir);
	const target = findWake(wakes, selector);
	if (!target) return { wakes };
	const next = wakes.filter((wake) => wake.id !== target.id);
	writeWakes(sessionId, next, agentDir);
	return { removed: target, wakes: next };
}

/** Firing removes the entry: the delivered message is the record. */
export function clearWake(sessionId: string, id: string, agentDir?: string): void {
	const wakes = readWakes(sessionId, agentDir);
	if (!wakes.some((wake) => wake.id === id)) return;
	writeWakes(
		sessionId,
		wakes.filter((wake) => wake.id !== id),
		agentDir
	);
}

// ---------------------------------------------------------------------------
// Presentation
// ---------------------------------------------------------------------------

/** The user message delivered when a wake fires; `now` after fireAt means late. */
export function wakeMessage(wake: Wake, now = Date.now()): string {
	const duration = formatInterval(wake.durationMs);
	const note = wake.note.trim() ? ` Note: ${wake.note.trim()}` : " No note was set.";
	const fireAt = Date.parse(wake.fireAt);
	const lateMs = Number.isFinite(fireAt) ? now - fireAt : 0;
	if (lateMs > 60_000)
		return `[wake-up] Your ${duration} sleep ended ${formatDuration(lateMs)} ago (the session was not running).${note}`;
	return `[wake-up] Your ${duration} sleep is over.${note}`;
}

/** Numbered listing for /sleep; numbers match findWake selectors. */
export function formatWakes(wakes: readonly Wake[], now = Date.now()): string {
	if (wakes.length === 0) {
		return 'no pending wake-ups\n  the agent sets one with the sleep tool: duration "20m", optional note';
	}
	const lines: string[] = [];
	wakes.forEach((wake, index) => {
		const fireAt = Date.parse(wake.fireAt);
		const inMs = Number.isFinite(fireAt) ? fireAt - now : 0;
		const note = wake.note.trim() ? ` — ${wake.note.trim()}` : "";
		lines.push(
			`${index + 1}. ${wake.id} · in ${formatDuration(Math.max(0, inMs))} · ${formatInterval(wake.durationMs)} sleep${note}`
		);
	});
	return lines.join("\n");
}

/** Footer segment for pending wakes: "zzz 14m", or undefined when none. */
export function sleepStatus(wakes: readonly Wake[], now = Date.now()): string | undefined {
	if (wakes.length === 0) return undefined;
	let soonest = Number.POSITIVE_INFINITY;
	for (const wake of wakes) {
		const fireAt = Date.parse(wake.fireAt);
		if (Number.isFinite(fireAt)) soonest = Math.min(soonest, fireAt - now);
	}
	return `zzz ${formatDuration(Math.max(0, soonest))}`;
}

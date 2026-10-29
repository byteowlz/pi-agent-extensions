/**
 * In-session inbox for external schedulers (skdlr), plus the tiny deliverer
 * those schedulers call.
 *
 * Why this exists: a skdlr schedule runs a *separate process*. For "check the
 * board" to land in the live session with its context intact, something must
 * hand the text to the running pi process. That is this Unix socket, private to
 * the user, one connection per delivery, one JSON line each way.
 *
 *   ~/.pi/agent/schedule/inbox/<sessionId>.sock   (dir 0700, socket 0600)
 *   { "text": "check the board", "at": "..." }  ->  { "ok": true }
 *
 * The deliverer (`deliver.mjs`, written next to the inbox at startup) is a
 * self-contained Node script with no imports, so a scheduler's command line does
 * not depend on pi, bun, tsx, or this extension's install path:
 *
 *   node ~/.pi/agent/schedule/bin/deliver.mjs --session <id> --text "check board"
 *
 * When the session is gone it exits non-zero and (with --queue) parks the text in
 * `queue/<sessionId>.jsonl`, which this extension drains on the next start and
 * labels with its age, so a missed check is visible instead of silent.
 */

import * as fs from "node:fs";
import * as net from "node:net";
import * as path from "node:path";

import { agentDirectory } from "./schedule.js";

/** Reject oversized deliveries rather than buffering them. */
export const MAX_DELIVERY_BYTES = 32 * 1024;
/** Keep the offline queue bounded: a broken link must not grow forever. */
export const MAX_QUEUED = 20;
/** Queued deliveries older than this are dropped on drain (stale checks are noise). */
export const MAX_QUEUE_AGE_MS = 24 * 3_600_000;

export interface Delivery {
	text: string;
	/** ISO timestamp from the sender, when it set one. */
	at?: string;
	source?: string;
}

export function inboxDir(agentDir?: string): string {
	return path.join(agentDirectory(agentDir), "schedule", "inbox");
}

export function binDir(agentDir?: string): string {
	return path.join(agentDirectory(agentDir), "schedule", "bin");
}

export function queueDir(agentDir?: string): string {
	return path.join(agentDirectory(agentDir), "schedule", "queue");
}

export function socketPath(sessionId: string, agentDir?: string): string {
	const safe = sessionId.replace(/[^A-Za-z0-9._-]+/g, "_");
	return path.join(inboxDir(agentDir), `${safe}.sock`);
}

export function delivererPath(agentDir?: string): string {
	return path.join(binDir(agentDir), "deliver.mjs");
}

export function queuePath(sessionId: string, agentDir?: string): string {
	const safe = sessionId.replace(/[^A-Za-z0-9._-]+/g, "_");
	return path.join(queueDir(agentDir), `${safe}.jsonl`);
}

/** Parse one line from the socket or the queue into a delivery, or an error. */
export function parseDelivery(raw: string): { delivery: Delivery } | { error: string } {
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		return { error: "malformed JSON" };
	}
	if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return { error: "payload must be an object" };
	const record = parsed as Record<string, unknown>;
	const text = record.text;
	if (typeof text !== "string" || !text.trim()) return { error: "text must be a non-empty string" };
	const delivery: Delivery = { text: text.trim() };
	if (typeof record.at === "string" && record.at) delivery.at = record.at;
	if (typeof record.source === "string" && record.source) delivery.source = record.source;
	return { delivery };
}

/**
 * Start the inbox listener for a session.
 *
 * Returns a close function. Listening failures are reported to the caller
 * (`onError`) instead of thrown: an unusable inbox must never take the session
 * down, and the scheduler side already fails closed.
 */
export function startInbox(options: {
	sessionId: string;
	agentDir?: string;
	onDelivery: (delivery: Delivery) => void;
	onError?: (message: string) => void;
}): { close: () => void; path: string } {
	const dir = inboxDir(options.agentDir);
	fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
	const socket = socketPath(options.sessionId, options.agentDir);
	// A leftover socket from a crashed session would make listen() fail with
	// EADDRINUSE; it cannot be live because the path is per session id.
	try {
		fs.rmSync(socket, { force: true });
	} catch {
		// ignore: listen() reports the real problem
	}

	const server = net.createServer((connection) => {
		let buffer = "";
		let settled = false;
		const reply = (payload: unknown): void => {
			if (settled) return;
			settled = true;
			try {
				connection.write(`${JSON.stringify(payload)}\n`);
			} catch {
				// peer vanished: nothing to do
			}
			connection.end();
		};
		connection.setEncoding("utf8");
		connection.on("data", (chunk: string) => {
			if (settled) return;
			buffer += chunk;
			if (buffer.length > MAX_DELIVERY_BYTES) {
				reply({ ok: false, error: "payload too large" });
				return;
			}
			const newline = buffer.indexOf("\n");
			if (newline === -1) return;
			const parsed = parseDelivery(buffer.slice(0, newline));
			if ("error" in parsed) {
				reply({ ok: false, error: parsed.error });
				return;
			}
			try {
				options.onDelivery(parsed.delivery);
				reply({ ok: true });
			} catch (error) {
				reply({ ok: false, error: error instanceof Error ? error.message : String(error) });
			}
		});
		connection.on("error", () => connection.destroy());
		// A scheduler that connects and says nothing must not wedge anything.
		connection.setTimeout(10_000, () => {
			reply({ ok: false, error: "timeout" });
			connection.destroy();
		});
	});

	server.on("error", (error) => options.onError?.(error.message));
	server.listen(socket, () => {
		try {
			fs.chmodSync(socket, 0o600);
		} catch {
			// best effort: the directory is already 0700
		}
	});
	return {
		close: () => {
			server.close();
			// Leave no stale socket behind; the next session start also clears it.
			try {
				fs.rmSync(socket, { force: true });
			} catch {
				// best effort
			}
		},
		path: socket,
	};
}

/** Append a delivery to the offline queue, keeping it bounded. */
export function enqueue(sessionId: string, delivery: Delivery, agentDir?: string): void {
	const file = queuePath(sessionId, agentDir);
	fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
	const line = `${JSON.stringify({ ...delivery, at: delivery.at ?? new Date().toISOString() })}\n`;
	fs.appendFileSync(file, line, { mode: 0o600 });
	// Trim oldest entries past the cap so a dead link cannot grow forever.
	const lines = fs
		.readFileSync(file, "utf-8")
		.split("\n")
		.filter((line) => line.trim());
	if (lines.length > MAX_QUEUED) fs.writeFileSync(file, `${lines.slice(-MAX_QUEUED).join("\n")}\n`);
}

export interface QueuedDelivery extends Delivery {
	ageMs: number;
}

/** Read and clear the queue, dropping stale entries and reporting their count. */
export function drainQueue(
	sessionId: string,
	now = Date.now(),
	agentDir?: string
): { deliveries: QueuedDelivery[]; dropped: number } {
	const file = queuePath(sessionId, agentDir);
	let lines: string[];
	try {
		lines = fs.readFileSync(file, "utf-8").split("\n");
	} catch {
		return { deliveries: [], dropped: 0 };
	}
	try {
		fs.rmSync(file, { force: true });
	} catch {
		// another process drained it first
	}
	const deliveries: QueuedDelivery[] = [];
	let dropped = 0;
	for (const line of lines) {
		if (!line.trim()) continue;
		const parsed = parseDelivery(line);
		if ("error" in parsed) {
			dropped += 1;
			continue;
		}
		const at = parsed.delivery.at ? Date.parse(parsed.delivery.at) : Number.NaN;
		const ageMs = Number.isFinite(at) ? Math.max(0, now - at) : 0;
		if (ageMs > MAX_QUEUE_AGE_MS) {
			dropped += 1;
			continue;
		}
		deliveries.push({ ...parsed.delivery, ageMs });
	}
	return { deliveries, dropped };
}

/** True when a live inbox socket exists for the session. */
export function inboxAlive(sessionId: string, agentDir?: string): boolean {
	try {
		return fs.statSync(socketPath(sessionId, agentDir)).isSocket();
	} catch {
		return false;
	}
}

/**
 * The self-contained deliverer. Written to disk at startup so a scheduler's
 * command line is a stable absolute path that needs nothing but Node.
 */
export const DELIVERER_SOURCE = `#!/usr/bin/env node
// pi-schedule deliverer — hands a scheduled prompt to a running pi session.
// Written by the pi-schedule extension; safe to delete, it is regenerated.
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";

function arg(name, fallback) {
  const i = process.argv.indexOf("--" + name);
  return i === -1 ? fallback : process.argv[i + 1];
}
const session = arg("session");
const text = arg("text");
const queue = process.argv.includes("--queue");
const strict = process.argv.includes("--strict");
const source = arg("source", "skdlr");
if (!session || !text) {
  console.error("usage: deliver.mjs --session <id> --text <prompt> [--agent-dir <dir>] [--queue] [--strict]");
  process.exit(2);
}
const agentDir = arg("agent-dir") || process.env.PI_CODING_AGENT_DIR || path.join(os.homedir(), ".pi", "agent");
const base = path.join(agentDir, "schedule");
const socket = path.join(base, "inbox", session.replace(/[^A-Za-z0-9._-]+/g, "_") + ".sock");

function queueIt(reason) {
  if (!queue) return false;
  const file = path.join(base, "queue", session.replace(/[^A-Za-z0-9._-]+/g, "_") + ".jsonl");
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  fs.appendFileSync(file, JSON.stringify({ text, source, at: new Date().toISOString(), reason }) + "\\n", { mode: 0o600 });
  return true;
}

const payload = JSON.stringify({ text, source, at: new Date().toISOString() }) + "\\n";
const socket_client = net.createConnection(socket);
let settled = false;
function done(code, message) {
  if (settled) return;
  settled = true;
  if (message) (code === 0 ? console.log : console.error)(message);
  try { socket_client.destroy(); } catch {}
  process.exit(code);
}
socket_client.setTimeout(5000, () => {
  if (queueIt("timeout")) done(0, "queued (session did not answer)");
  else done(strict ? 1 : 1, "session did not answer");
});
socket_client.on("error", (error) => {
  if (queueIt(error.code || "unreachable")) done(0, "queued (session not running)");
  done(1, "no live session: " + (error.code || error.message));
});
socket_client.on("connect", () => socket_client.write(payload));
socket_client.on("data", (chunk) => {
  const line = String(chunk).split("\\n")[0];
  let reply = {};
  try { reply = JSON.parse(line); } catch {}
  if (reply.ok) done(0, "delivered");
  else done(1, "rejected: " + (reply.error || line));
});
socket_client.on("end", () => done(1, "session closed the connection without answering"));
`;

/** Write (or refresh) the deliverer script. Returns its path. */
export function ensureDeliverer(agentDir?: string): string {
	const file = delivererPath(agentDir);
	fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
	let existing: string | undefined;
	try {
		existing = fs.readFileSync(file, "utf-8");
	} catch {
		existing = undefined;
	}
	if (existing !== DELIVERER_SOURCE) fs.writeFileSync(file, DELIVERER_SOURCE, { mode: 0o700 });
	return file;
}

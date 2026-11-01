#!/usr/bin/env node
/**
 * Reload every live Pi on this machine that runs pi-tui-rpc.
 *
 *   node reload-all.mjs [--dry-run] [--json] [--legacy-herdr] [--wait] [--timeout <s>] [--pid <n>]
 *
 * Pis with this extension's `reload` command reload now when idle; working ones
 * queue it and reload when their turn (and any compaction) finishes. Nothing is
 * sent to the model and no input lease is taken.
 *
 * Pis still running an older pi-tui-rpc cannot reload over the socket. With
 * --legacy-herdr they get a typed `/reload` through herdr, but only when the
 * Pi is idle and its input box is empty, so a draft is never submitted. Busy
 * ones are skipped, or re-checked until --timeout with --wait.
 */

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import process from "node:process";

const args = process.argv.slice(2);
const has = (flag) => args.includes(flag);
const value = (flag) => {
	const at = args.indexOf(flag);
	return at >= 0 ? args[at + 1] : undefined;
};
const dryRun = has("--dry-run");
const json = has("--json");
const legacyHerdr = has("--legacy-herdr");
const wait = has("--wait");
const timeoutMs = Number(value("--timeout") ?? 1800) * 1000;
/** Only this Pi process (repeatable). */
const onlyPids = args.flatMap((arg, at) => (arg === "--pid" ? [Number(args[at + 1])] : []));

/** Same rule as socket-path.ts: a private XDG_RUNTIME_DIR on Linux, else tmpdir. */
function socketDirectory() {
	const runtime = process.env.XDG_RUNTIME_DIR?.trim();
	if (process.platform === "linux" && runtime && path.isAbsolute(runtime)) {
		try {
			const stat = fs.statSync(runtime);
			if (stat.isDirectory() && stat.uid === process.getuid?.() && (stat.mode & 0o077) === 0) return runtime;
		} catch {
			// Fall back below.
		}
	}
	return os.tmpdir();
}

function alive(pid) {
	try {
		process.kill(pid, 0);
		return true;
	} catch (error) {
		return error.code === "EPERM";
	}
}

/** Connect, read the hello, then send `command` if the hub offers it and read its response. */
function talk(socketPath, command, timeout = 4000) {
	return new Promise((resolve) => {
		const socket = net.connect(socketPath);
		const out = { hello: null, response: null, error: null };
		let buffer = "";
		const done = () => {
			clearTimeout(timer);
			socket.destroy();
			resolve(out);
		};
		const timer = setTimeout(() => {
			out.error ??= "timeout";
			done();
		}, timeout);
		socket.setEncoding("utf8");
		socket.on("error", (error) => {
			out.error = error.code ?? String(error);
			done();
		});
		socket.on("data", (chunk) => {
			buffer += chunk;
			for (let at = buffer.indexOf("\n"); at >= 0; at = buffer.indexOf("\n")) {
				const line = buffer.slice(0, at);
				buffer = buffer.slice(at + 1);
				let frame;
				try {
					frame = JSON.parse(line);
				} catch {
					continue;
				}
				if (frame.type === "hello") {
					out.hello = frame;
					if (!command || !frame.commands?.includes(command.type)) return done();
					socket.write(`${JSON.stringify(command)}\n`);
				} else if (frame.type === "response" && command && frame.id === command.id) {
					out.response = frame;
					return done();
				}
			}
		});
	});
}

function herdrAgents() {
	try {
		const raw = execFileSync("herdr", ["agent", "list"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
		return JSON.parse(raw).result?.agents ?? [];
	} catch {
		return null;
	}
}

/** The Pi input box is the text between the last two full-width rules. */
function editorEmpty(pane) {
	let screen;
	try {
		screen = execFileSync("herdr", ["agent", "read", pane, "--source", "visible"], {
			encoding: "utf8",
			stdio: ["ignore", "pipe", "ignore"],
		});
	} catch {
		return false;
	}
	const lines = screen.split("\n");
	const rules = [];
	lines.forEach((line, index) => {
		const trimmed = line.trim();
		if (trimmed.length >= 20 && /^─+$/.test(trimmed)) rules.push(index);
	});
	if (rules.length < 2) return false;
	const [top, bottom] = rules.slice(-2);
	if (bottom - top < 2) return false;
	return lines.slice(top + 1, bottom).every((line) => line.trim() === "");
}

async function inspect(socketPath, pid) {
	const result = await talk(socketPath, { id: "state", type: "get_state" });
	const state = result.response?.data ?? {};
	return {
		pid,
		socket: socketPath,
		reachable: Boolean(result.hello),
		reloadCapable: Boolean(result.hello?.commands?.includes("reload")),
		working: Boolean(state.isStreaming || state.isCompacting),
		session: state.sessionName ?? null,
		sessionFile: state.sessionFile ?? null,
		cwd: state.cwd ?? null,
		error: result.error && !result.hello ? result.error : null,
	};
}

async function reloadModern(pi) {
	const result = await talk(pi.socket, { id: "reload", type: "reload" });
	const response = result.response;
	if (!response) return `error: ${result.error ?? "no response"}`;
	if (!response.success) return `error: ${response.error}`;
	return response.data?.reload ?? "unknown";
}

async function reloadLegacy(pi, agents) {
	if (!legacyHerdr) return "legacy: run /reload in this Pi once (or pass --legacy-herdr)";
	if (!agents) return "legacy: herdr unavailable";
	const agent = agents.find((a) => a.agent === "pi" && a.agent_session?.value === pi.sessionFile);
	if (!agent) return "legacy: not in a herdr pane";
	if (pi.working || agent.agent_status === "working" || agent.agent_status === "blocked") return "legacy-busy";
	if (!editorEmpty(agent.pane_id)) return "legacy: input box not empty, skipped";
	if (dryRun) return "legacy: would type /reload";
	execFileSync("herdr", ["agent", "prompt", agent.pane_id, "/reload"], { stdio: "ignore" });
	// The reloaded extension reopens the same socket and now offers `reload`.
	const deadline = Date.now() + 20000;
	while (Date.now() < deadline) {
		await new Promise((resolve) => setTimeout(resolve, 1000));
		const after = await inspect(pi.socket, pi.pid);
		if (after.reloadCapable) return "reloaded (legacy, via herdr)";
	}
	return "legacy: typed /reload, reload not confirmed";
}

async function main() {
	const dir = socketDirectory();
	const sockets = fs
		.readdirSync(dir)
		.map((name) => /^pi-tui-rpc-(\d+)\.sock$/.exec(name))
		.filter(Boolean)
		.map((match) => ({ pid: Number(match[1]), socket: path.join(dir, match[0]) }))
		.filter(({ pid }) => alive(pid) && (onlyPids.length === 0 || onlyPids.includes(pid)));
	const pis = [];
	for (const { pid, socket } of sockets) pis.push(await inspect(socket, pid));
	const agents = legacyHerdr ? herdrAgents() : null;
	const rows = [];
	for (const pi of pis) {
		if (!pi.reachable) {
			rows.push({ ...pi, result: `unreachable (${pi.error})` });
			continue;
		}
		if (pi.reloadCapable) {
			const result = dryRun ? (pi.working ? "would queue" : "would reload") : await reloadModern(pi);
			rows.push({ ...pi, result });
		} else {
			rows.push({ ...pi, result: await reloadLegacy(pi, agents) });
		}
	}
	// Legacy Pis that were working: re-check until idle when asked to wait.
	const startedAt = Date.now();
	while (wait && legacyHerdr && !dryRun && rows.some((r) => r.result === "legacy-busy") && Date.now() - startedAt < timeoutMs) {
		await new Promise((resolve) => setTimeout(resolve, 5000));
		const fresh = herdrAgents();
		for (const row of rows.filter((r) => r.result === "legacy-busy")) {
			const now = await inspect(row.socket, row.pid);
			if (!now.reachable) {
				row.result = "gone";
				continue;
			}
			if (now.reloadCapable) {
				row.result = "reloaded";
				continue;
			}
			const result = await reloadLegacy({ ...row, ...now }, fresh);
			if (result !== "legacy-busy") row.result = result;
		}
	}
	for (const row of rows) if (row.result === "legacy-busy") row.result = "legacy: working, not reloaded (use --wait)";
	if (json) {
		console.log(JSON.stringify(rows.map(({ socket, sessionFile, ...rest }) => rest), null, 2));
		return;
	}
	for (const row of rows) {
		const where = row.cwd ? path.basename(row.cwd) : "?";
		console.log(`${String(row.pid).padEnd(7)} ${(row.working ? "working" : "idle").padEnd(8)} ${where.padEnd(22).slice(0, 22)} ${(row.session ?? "").slice(0, 40).padEnd(40)} ${row.result}`);
	}
	const count = (predicate) => rows.filter(predicate).length;
	console.log(
		`\n${rows.length} Pis: ${count((r) => /^(reloading|reloaded)/.test(r.result))} reloading, ${count((r) => r.result === "queued" || r.result === "already_pending")} queued, ${count((r) => r.result.startsWith("legacy"))} legacy, ${count((r) => /^(error|unreachable)/.test(r.result))} failed`
	);
}

main().catch((error) => {
	console.error(error instanceof Error ? error.message : String(error));
	process.exit(1);
});

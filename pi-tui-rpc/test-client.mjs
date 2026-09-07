#!/usr/bin/env node
/**
 * Manual/scripted test client for pi-tui-rpc.
 *
 * Usage:
 *   node test-client.mjs <socket-path> [--send '<json>'] [--send-file <path>]
 *                       [--wait-settled] [--timeout <ms>] [--quiet]
 *
 * Prints every received frame as one JSON line (prefixed by ms since start
 * unless --quiet). Exits after --wait-settled sees an agent_settled event,
 * after the timeout, or on Ctrl-C. With no --send options it just observes.
 */

import fs from "node:fs";
import net from "node:net";
import process from "node:process";

function arg(name) {
	const index = process.argv.indexOf(name);
	return index >= 0 ? process.argv[index + 1] : undefined;
}

const socketPath = process.argv[2];
if (!socketPath || socketPath.startsWith("--")) {
	console.error(
		"usage: node test-client.mjs <socket-path> [--send json] [--send-file path] [--wait-settled] [--timeout ms] [--quiet]"
	);
	process.exit(2);
}

const quiet = process.argv.includes("--quiet");
const waitSettled = process.argv.includes("--wait-settled");
const timeoutMs = Number(arg("--timeout") ?? 300000);
const startedAt = Date.now();
let settledSeen = false;
let sent = false;

const socket = net.connect(socketPath);
let buffer = "";

socket.setEncoding("utf8");
socket.on("connect", () => {
	const sendPath = arg("--send-file");
	const lines = [];
	const inline = arg("--send");
	if (inline) {
		lines.push(inline);
	}
	if (sendPath) {
		for (const line of fs.readFileSync(sendPath, "utf8").split("\n")) {
			const trimmed = line.trim();
			if (trimmed.length > 0) {
				lines.push(trimmed);
			}
		}
	}
	for (const line of lines) {
		socket.write(`${line}\n`);
	}
	sent = true;
	if (lines.length === 0 && !waitSettled) {
		// Pure observer mode: run until timeout or signal.
	}
});

socket.on("data", (chunk) => {
	buffer += chunk;
	let index = buffer.indexOf("\n");
	while (index >= 0) {
		const line = buffer.slice(0, index);
		buffer = buffer.slice(index + 1);
		if (line.trim().length > 0) {
			const prefix = quiet ? "" : `+${Date.now() - startedAt}ms `;
			console.log(`${prefix}${line}`);
			try {
				const frame = JSON.parse(line);
				if (frame.type === "event" && frame.event === "agent_settled") {
					settledSeen = true;
				}
			} catch {
				// Non-JSON frames are printed verbatim above.
			}
		}
		index = buffer.indexOf("\n");
	}
});

socket.on("error", (error) => {
	console.error(`connect error: ${error.message}`);
	process.exit(1);
});

const timer = setTimeout(() => {
	process.exit(waitSettled && sent ? 3 : 0);
}, timeoutMs);

setInterval(() => {
	if (waitSettled && sent && settledSeen) {
		clearTimeout(timer);
		process.exit(0);
	}
}, 50);

process.on("SIGINT", () => {
	process.exit(0);
});

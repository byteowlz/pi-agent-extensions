/**
 * Unix-socket hub for pi-tui-rpc.
 *
 * Owns the listening socket, per-client buffers, and strict JSONL framing.
 * Line handling is delegated to the caller; the hub only parses frames and
 * provides reply/broadcast primitives. Dead clients are pruned without
 * disturbing the rest of the fanout.
 */

import fs from "node:fs";
import net from "node:net";
import { safeParseLine } from "./protocol.js";

export type ReplyFn = (frame: unknown) => void;

export interface HubOptions {
	socketPath: string;
	/** Called for every parsed client line. Parse failures are answered before this runs. */
	onLine(clientId: string, value: unknown, reply: ReplyFn): void;
	/** Called after a client is registered; use it to send a hello frame. */
	onConnect?(clientId: string, reply: ReplyFn): void;
}

export interface Hub {
	start(): Promise<void>;
	stop(): Promise<void>;
	broadcast(frame: unknown): void;
	send(clientId: string, frame: unknown): void;
	clientCount(): number;
}

export function createHub(options: HubOptions): Hub {
	const clients = new Map<string, net.Socket>();
	const buffers = new Map<string, string>();
	let clientSeq = 0;
	let server: net.Server | null = null;
	let listening = false;

	const writeFrame = (socket: net.Socket, frame: unknown): void => {
		if (!socket.writable) {
			return;
		}
		try {
			socket.write(`${JSON.stringify(frame)}\n`);
		} catch {
			// Socket died between the writable check and the write; the close
			// handler prunes it.
		}
	};

	const reply = (clientId: string): ReplyFn => {
		return (frame: unknown) => {
			const socket = clients.get(clientId);
			if (socket) {
				writeFrame(socket, frame);
			}
		};
	};

	const handleChunk = (clientId: string, chunk: string): void => {
		const previous = buffers.get(clientId) ?? "";
		const combined = previous + chunk;
		const lines = combined.split("\n");
		const rest = lines.pop() ?? "";
		buffers.set(clientId, rest);
		for (const line of lines) {
			const parsed = safeParseLine(line);
			if (parsed.ok) {
				options.onLine(clientId, parsed.value, reply(clientId));
				continue;
			}
			if (parsed.empty) {
				continue;
			}
			reply(clientId)({
				type: "response",
				command: "parse",
				success: false,
				error: parsed.error,
			});
		}
	};

	const removeClient = (clientId: string): void => {
		clients.delete(clientId);
		buffers.delete(clientId);
	};

	const handleConnection = (socket: net.Socket): void => {
		clientSeq += 1;
		const clientId = `c${clientSeq}`;
		clients.set(clientId, socket);
		buffers.set(clientId, "");
		options.onConnect?.(clientId, reply(clientId));
		socket.setEncoding("utf8");
		socket.on("data", (chunk: string) => {
			handleChunk(clientId, chunk);
		});
		socket.on("error", () => {
			removeClient(clientId);
		});
		socket.on("close", () => {
			removeClient(clientId);
		});
	};

	return {
		async start(): Promise<void> {
			if (listening) {
				return;
			}
			// A stale socket file from a crashed previous owner would block listen().
			fs.rmSync(options.socketPath, { force: true });
			await new Promise<void>((resolve, reject) => {
				server = net.createServer((socket) => {
					handleConnection(socket);
				});
				server.once("error", reject);
				server.listen(options.socketPath, () => {
					listening = true;
					resolve();
				});
			});
		},
		async stop(): Promise<void> {
			const current = server;
			server = null;
			listening = false;
			for (const socket of clients.values()) {
				socket.destroy();
			}
			clients.clear();
			buffers.clear();
			if (!current) {
				return;
			}
			await new Promise<void>((resolve) => {
				current.close(() => resolve());
			});
			fs.rmSync(options.socketPath, { force: true });
		},
		broadcast(frame: unknown): void {
			for (const socket of clients.values()) {
				writeFrame(socket, frame);
			}
		},
		send(clientId: string, frame: unknown): void {
			const socket = clients.get(clientId);
			if (socket) {
				writeFrame(socket, frame);
			}
		},
		clientCount(): number {
			return clients.size;
		},
	};
}

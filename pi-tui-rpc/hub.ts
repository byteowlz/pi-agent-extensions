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
	/** Exactly once on EOF, failure, backpressure or stop. */
	onDisconnect?(clientId: string): void;
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

	const writeFrame = (clientId: string, socket: net.Socket, frame: unknown): void => {
		if (!socket.writable) {
			return;
		}
		try {
			const line = `${JSON.stringify(frame)}\n`;
			if (socket.writableLength + Buffer.byteLength(line) > 1024 * 1024) {
				removeClient(clientId);
				socket.destroy();
				return;
			}
			socket.write(line);
		} catch {
			// Socket died between the writable check and the write; the close
			// handler prunes it.
		}
	};

	const reply = (clientId: string): ReplyFn => {
		return (frame: unknown) => {
			const socket = clients.get(clientId);
			if (socket) {
				writeFrame(clientId, socket, frame);
			}
		};
	};

	const handleChunk = (clientId: string, chunk: string): void => {
		const previous = buffers.get(clientId) ?? "";
		const lines = (previous + chunk).split("\n");
		const rest = lines.pop() ?? "";
		if (
			Buffer.byteLength(rest) > 1024 * 1024 ||
			lines.length > 128 ||
			lines.some((line) => Buffer.byteLength(line) > 1024 * 1024)
		) {
			const socket = clients.get(clientId);
			removeClient(clientId);
			socket?.destroy();
			return;
		}
		buffers.set(clientId, rest);
		for (const line of lines) {
			if (!clients.has(clientId)) return;
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
		if (!clients.delete(clientId)) return;
		buffers.delete(clientId);
		options.onDisconnect?.(clientId);
	};

	const handleConnection = (socket: net.Socket): void => {
		if (clients.size >= 64) {
			socket.destroy();
			return;
		}
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
			socket.destroy();
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
					fs.chmodSync(options.socketPath, 0o600);
					listening = true;
					resolve();
				});
			});
		},
		async stop(): Promise<void> {
			const current = server;
			server = null;
			listening = false;
			for (const [clientId, socket] of [...clients]) {
				removeClient(clientId);
				socket.destroy();
			}
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
			for (const [clientId, socket] of [...clients]) {
				writeFrame(clientId, socket, frame);
			}
		},
		send(clientId: string, frame: unknown): void {
			const socket = clients.get(clientId);
			if (socket) {
				writeFrame(clientId, socket, frame);
			}
		},
		clientCount(): number {
			return clients.size;
		},
	};
}

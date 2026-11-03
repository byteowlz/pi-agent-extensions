import { expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import net from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHub } from "./hub.js";
import type { RuntimeEvent } from "./protocol/runtime-interactions/v1/RuntimeEvent.js";
import { parseNegotiationFrame } from "./wire.js";

const event: RuntimeEvent = {
	version: 1,
	eventId: "event-1",
	binding: {
		publicSessionId: "public-1",
		nativeSessionId: "native-1",
		runtimeGeneration: 1,
		controllerId: "controller-1",
		controllerGeneration: 1,
	},
	payload: { kind: "command_outcome", operationId: "op-1", state: "started", errorId: null },
};

function client(socketPath: string) {
	const socket = net.connect(socketPath);
	socket.setEncoding("utf8");
	let buffer = "";
	const waiters: Array<(line: unknown) => void> = [];
	socket.on("data", (chunk: string) => {
		buffer += chunk;
		const lines = buffer.split("\n");
		buffer = lines.pop() ?? "";
		for (const line of lines) {
			if (!line.trim()) continue;
			const waiter = waiters.shift();
			if (waiter) waiter(JSON.parse(line));
		}
	});
	return {
		socket,
		send(frame: unknown) {
			socket.write(`${JSON.stringify(frame)}\n`);
		},
		next(): Promise<unknown> {
			return new Promise((resolve, reject) => {
				const timer = setTimeout(() => reject(new Error("timeout waiting for frame")), 3000);
				waiters.push((line) => {
					clearTimeout(timer);
					resolve(line);
				});
			});
		},
	};
}

test("interaction frames are delivered only to connections that negotiated v1", async () => {
	const dir = mkdtempSync(join(tmpdir(), "interaction-hub-"));
	const socketPath = join(dir, "hub.sock");
	const connected: Array<{ clientId: string; resolve: (id: string) => void }> = [];
	let hub: ReturnType<typeof createHub>;
	hub = createHub({
		socketPath,
		interactionVersions: [1],
		onConnect: (clientId, reply) => {
			reply({ type: "hello", v: 1 });
			const resolve = connected.pop()?.resolve;
			resolve?.(clientId);
		},
		onLine: (clientId, value, reply) => {
			const negotiation = parseNegotiationFrame(value);
			if (!negotiation.ok) {
				reply({ type: "error", code: negotiation.code });
				return;
			}
			const version = negotiation.value;
			if (version !== null) hub.negotiateInteraction(clientId, version);
			reply({ type: "interaction_negotiated", version });
		},
	});
	const nextClientId = () =>
		new Promise<string>((resolve) => {
			connected.push({ clientId: "", resolve });
		});

	try {
		await hub.start();
		const firstId = nextClientId();
		const a = client(socketPath);
		const aId = await firstId;
		await a.next(); // hello
		expect(hub.interactionVersion(aId)).toBeNull();
		expect(hub.deliverInteractionEvent(aId, event)).toBe(false);

		a.send({ type: "interaction_negotiate", versions: [1] });
		expect(await a.next()).toEqual({ type: "interaction_negotiated", version: 1 });
		expect(hub.interactionVersion(aId)).toBe(1);
		expect(hub.deliverInteractionEvent(aId, event)).toBe(true);
		expect(await a.next()).toEqual({ type: "interaction_event", event });

		const secondId = nextClientId();
		const b = client(socketPath);
		const bId = await secondId;
		await b.next(); // hello
		expect(hub.deliverInteractionEvent(bId, event)).toBe(false);
		// An unsupported offer is answered with null and does not revoke v1.
		a.send({ type: "interaction_negotiate", versions: [2] });
		expect(await a.next()).toEqual({ type: "interaction_negotiated", version: null });
		expect(hub.interactionVersion(aId)).toBe(1);

		hub.broadcastInteractionEvent(event);
		expect(await a.next()).toEqual({ type: "interaction_event", event });

		a.socket.destroy();
		b.socket.destroy();
	} finally {
		await hub.stop();
		rmSync(dir, { recursive: true, force: true });
	}
});

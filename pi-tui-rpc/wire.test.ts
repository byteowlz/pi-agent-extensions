import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { createHub } from "./hub";
import { MAX_EVENT_DATA_BYTES, eventFrame, wireEventData } from "./protocol";

const bytes = (value: unknown): number => Buffer.byteLength(JSON.stringify(value));

describe("bounded event wire shape", () => {
	test("turn_end drops boundary plumbing, including the whole-conversation context", () => {
		const huge = { messages: Array.from({ length: 50 }, () => ({ role: "user", content: "x".repeat(100_000) })) };
		const event = {
			type: "turn_end",
			turnIndex: 3,
			message: { role: "assistant", content: [{ type: "text", text: "done" }] },
			toolResults: [{ role: "toolResult", toolCallId: "t1", content: [{ type: "text", text: "ok" }] }],
			messageEntryId: "e1",
			toolResultEntryIds: ["e2"],
			outcome: "completed",
			entries: [],
			continue: false,
			context: huge,
		};
		const wire = wireEventData("turn_end", event) as Record<string, unknown>;
		expect(wire.context).toBeUndefined();
		expect(wire.entries).toBeUndefined();
		expect(wire.continue).toBeUndefined();
		expect(wire.turnIndex).toBe(3);
		expect(wire.message).toEqual(event.message);
		expect(wire.toolResults).toEqual(event.toolResults);
		expect(wire.outcome).toBe("completed");
		expect(bytes(wire)).toBeLessThan(2_000);
		// The source event is untouched: other handlers still see the real context.
		expect(event.context).toBe(huge);
	});

	test("inline image data is replaced by its size; structure and mime type stay", () => {
		const data = "A".repeat(2_000_000);
		const event = {
			toolCallId: "read-1",
			toolName: "read",
			result: {
				content: [
					{ type: "text", text: "Read image" },
					{ type: "image", data, mimeType: "image/png" },
				],
			},
		};
		const wire = wireEventData("tool_execution_end", event) as typeof event;
		expect(wire.toolCallId).toBe("read-1");
		expect(wire.toolName).toBe("read");
		expect(wire.result.content[0]).toEqual({ type: "text", text: "Read image" });
		expect(wire.result.content[1]).toEqual({ type: "image", mimeType: "image/png", omittedBytes: 2_000_000 });
		expect(bytes(wire)).toBeLessThan(1_000);
		expect(event.result.content[1].data).toBe(data);
	});

	test("nested provider-style image sources are redacted too", () => {
		const event = {
			message: {
				role: "user",
				content: [{ type: "image", source: { type: "base64", media_type: "image/jpeg", data: "B".repeat(900_000) } }],
			},
		};
		const wire = wireEventData("message_end", event) as { message: { content: Array<{ source: Record<string, unknown> }> } };
		expect(wire.message.content[0].source.data).toBeUndefined();
		expect(wire.message.content[0].source.omittedBytes).toBe(900_000);
		expect(wire.message.content[0].source.media_type).toBe("image/jpeg");
	});

	test("an event still over the cap keeps identity fields and says what was omitted", () => {
		const messages = Array.from({ length: 40 }, (_, i) => ({
			role: "toolResult",
			content: [{ type: "text", text: `${i}`.repeat(30_000) }],
		}));
		const wire = wireEventData("agent_end", { messages, outcome: "completed" }) as Record<string, unknown>;
		expect(bytes(wire)).toBeLessThanOrEqual(MAX_EVENT_DATA_BYTES);
		expect(wire.outcome).toBe("completed");
		expect(wire.messages).toBeUndefined();
		expect(wire.omitted).toEqual({ reason: "oversized", bytes: bytes({ messages, outcome: "completed" }) });
	});

	test("tool identity survives the last-resort cap so observers can close the activity", () => {
		const wire = wireEventData("tool_execution_end", {
			toolCallId: "big-1",
			toolName: "bash",
			result: { content: [{ type: "text", text: "y".repeat(MAX_EVENT_DATA_BYTES + 10) }] },
			isError: false,
		}) as Record<string, unknown>;
		expect(wire.toolCallId).toBe("big-1");
		expect(wire.toolName).toBe("bash");
		expect(wire.isError).toBe(false);
		expect(wire.result).toBeUndefined();
	});

	test("ordinary streaming frames pass through unchanged", () => {
		const event = {
			message: { role: "assistant", content: [{ type: "text", text: "Hello wor" }] },
			assistantMessageEvent: { type: "text_delta", delta: "wor" },
		};
		expect(wireEventData("message_update", event)).toEqual(event);
		expect(wireEventData("agent_start", undefined)).toBeUndefined();
	});
});

function socketPath(): string {
	return path.join(fs.mkdtempSync(path.join(os.tmpdir(), "tui-wire-")), "s.sock");
}

type Frame = { event?: string; data?: { seq?: number } };

function update(seq: number, text: string): unknown {
	return eventFrame("message_update", { message: { role: "assistant", content: [{ type: "text", text }] }, seq }, () => seq);
}

/** Hub callbacks the tests do not exercise. */
const ignoreLine = (): void => undefined;

async function readFrames(socket: net.Socket, until: (frames: Frame[]) => boolean): Promise<Frame[]> {
	const frames: Frame[] = [];
	let pending = "";
	return await new Promise((resolve, reject) => {
		const timer = setTimeout(() => reject(new Error(`timed out after ${frames.length} frames`)), 5_000);
		socket.on("data", (chunk) => {
			pending += chunk.toString();
			let i = pending.indexOf("\n");
			while (i >= 0) {
				frames.push(JSON.parse(pending.slice(0, i)));
				pending = pending.slice(i + 1);
				i = pending.indexOf("\n");
			}
			if (until(frames)) {
				clearTimeout(timer);
				resolve(frames);
			}
		});
		socket.resume();
	});
}

describe("hub backpressure", () => {
	test("a slow reader is not dropped for superseded message_update frames and sees the newest in order", async () => {
		const sock = socketPath();
		let disconnected = 0;
		const hub = createHub({ socketPath: sock, onLine: ignoreLine, onDisconnect: () => disconnected++ });
		await hub.start();
		const client = net.createConnection(sock);
		await new Promise((r) => client.once("connect", r));
		client.pause();
		await Bun.sleep(30);
		// ~6 MB of quadratic re-sends: far over the 1 MiB backlog cap if written verbatim.
		let text = "";
		for (let seq = 1; seq <= 300; seq++) {
			text += "word ".repeat(8);
			hub.broadcast(update(seq, text));
		}
		hub.broadcast(eventFrame("message_end", { message: { role: "assistant" } }, () => 999));
		const frames = await readFrames(client, (f) => f.some((x) => x.event === "message_end"));
		expect(disconnected).toBe(0);
		const updates = frames.filter((f) => f.event === "message_update");
		const last = updates.at(-1);
		expect(updates.length).toBeGreaterThan(0);
		expect(updates.length).toBeLessThan(300);
		// The newest update is delivered, and before the frame that ends the message.
		expect(last?.data?.seq).toBe(300);
		const seqs = updates.map((f) => f.data?.seq ?? 0);
		expect([...seqs].sort((a, b) => a - b)).toEqual(seqs);
		expect(frames.findIndex((f) => f.event === "message_end")).toBeGreaterThan(last ? frames.lastIndexOf(last) : -1);
		client.destroy();
		await hub.stop();
	});

	test("a reader that never drains non-coalescable frames is still dropped", async () => {
		const sock = socketPath();
		let disconnected = 0;
		const hub = createHub({ socketPath: sock, onLine: ignoreLine, onDisconnect: () => disconnected++ });
		await hub.start();
		const client = net.createConnection(sock);
		await new Promise((r) => client.once("connect", r));
		client.pause();
		await Bun.sleep(30);
		for (let seq = 1; seq <= 400; seq++) {
			hub.broadcast(
				eventFrame("tool_execution_update", { toolCallId: "t", toolName: "bash", partialResult: "z".repeat(10_000) }, () => seq)
			);
		}
		await Bun.sleep(50);
		expect(disconnected).toBe(1);
		client.destroy();
		await hub.stop();
	});
});

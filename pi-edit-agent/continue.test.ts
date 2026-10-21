import { expect, test } from "bun:test";
import { CONTINUE_MESSAGE_TYPE, type EditAgentConfig, sendContinuation } from "./index.js";

const base: EditAgentConfig = {
	continuePrompt: "I edited your previous message. Continue from there.",
	defaultAction: "continue",
	hideContinuePrompt: true,
};

function recorder() {
	const calls: { kind: "message" | "user"; payload: unknown; options?: unknown }[] = [];
	return {
		calls,
		sctx: {
			sendMessage: async (message: unknown, options: unknown) => {
				calls.push({ kind: "message", payload: message, options });
			},
			sendUserMessage: async (content: unknown) => {
				calls.push({ kind: "user", payload: content });
			},
		} as never,
	};
}

test("by default the continuation prompt is sent hidden and does not render as a turn", async () => {
	const r = recorder();
	await sendContinuation(r.sctx, base);
	expect(r.calls).toHaveLength(1);
	expect(r.calls[0]).toEqual({
		kind: "message",
		payload: {
			customType: CONTINUE_MESSAGE_TYPE,
			content: [{ type: "text", text: base.continuePrompt }],
			display: false,
		},
		options: { triggerTurn: true },
	});
});

test("hideContinuePrompt:false keeps the visible user turn for anyone who wants it", async () => {
	const r = recorder();
	await sendContinuation(r.sctx, { ...base, hideContinuePrompt: false });
	expect(r.calls).toEqual([{ kind: "user", payload: base.continuePrompt }]);
});

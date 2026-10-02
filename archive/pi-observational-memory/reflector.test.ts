import { describe, expect, mock, test } from "bun:test";
import type { AssistantMessage, Model } from "@earendil-works/pi-ai";
import type { ModelRegistry } from "@earendil-works/pi-coding-agent";
import { getDefaultConfig } from "./config.js";
import { runReflector } from "./reflector.js";

const model: Model<"openai-completions"> = {
	id: "fixture",
	name: "Fixture",
	api: "openai-completions",
	provider: "synthetic",
	baseUrl: "http://127.0.0.1:9/v1",
	reasoning: false,
	input: ["text"],
	contextWindow: 4096,
	maxTokens: 256,
	cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
};

function response(text: string, stopReason: AssistantMessage["stopReason"] = "stop"): AssistantMessage {
	return {
		role: "assistant",
		content: [{ type: "text", text }],
		api: model.api,
		provider: model.provider,
		model: model.id,
		timestamp: 1,
		stopReason,
		usage: {
			input: 0,
			output: 0,
			cacheRead: 0,
			cacheWrite: 0,
			totalTokens: 0,
			cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
		},
	};
}

const observations = "Important synthetic observation. ".repeat(100);

describe("Pi 1.0 reflector registry contract", () => {
	test("routes completion through the session registry without overriding request-time auth", async () => {
		const complete = mock(async (..._args: Parameters<ModelRegistry["complete"]>) => response("Short summary."));
		const signal = new AbortController().signal;
		const config = getDefaultConfig().reflector;
		const result = await runReflector(observations, config, model, { complete }, signal, () => undefined);
		expect(result).toBe("Short summary.");
		expect(complete).toHaveBeenCalledTimes(1);
		const [sentModel, context, options] = complete.mock.calls[0];
		expect(sentModel).toBe(model);
		expect(context.messages[0].role).toBe("user");
		expect(options?.signal).toBe(signal);
		expect(options?.maxTokens).toBe(config.maxOutputTokens);
		expect(options).not.toHaveProperty("apiKey");
	});

	test("both compression passes use the same registry and preserve the smaller result", async () => {
		let calls = 0;
		const complete = mock(async (..._args: Parameters<ModelRegistry["complete"]>) =>
			response(++calls === 1 ? observations : "Compressed.")
		);
		const result = await runReflector(
			observations,
			getDefaultConfig().reflector,
			model,
			{ complete },
			new AbortController().signal,
			() => undefined
		);
		expect(result).toBe("Compressed.");
		expect(complete).toHaveBeenCalledTimes(2);
	});

	for (const stopReason of ["error", "aborted"] as const) {
		test(`does not treat a ${stopReason} response as successful empty compression`, async () => {
			const complete = mock(async (..._args: Parameters<ModelRegistry["complete"]>) => response("", stopReason));
			await expect(
				runReflector(
					observations,
					getDefaultConfig().reflector,
					model,
					{ complete },
					new AbortController().signal,
					() => undefined
				)
			).rejects.toThrow(`Reflector ${stopReason}`);
		});
	}
});

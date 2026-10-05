import { expect, test } from "bun:test";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { type StatusQuery, collectContributions } from "./contributions.js";
function api(emit: (_channel: string, query: StatusQuery) => void) {
	return { events: { emit } } as unknown as Pick<ExtensionAPI, "events">;
}
test("optional contributors: no provider yields empty; bounds snapshot and isolates rejection", async () => {
	expect(
		await collectContributions(
			api(() => {}),
			"s"
		)
	).toEqual([]);
	const result = await collectContributions(
		api((_event, q) => {
			expect(q.sessionId).toBe("s");
			q.reply(Promise.reject(new Error("private provider error")));
			q.reply({ id: "session-tools", version: 1, status: "ok", details: { owner: "herdr", large: "x".repeat(2000), count: 3 } });
		}),
		"s"
	);
	expect(result).toHaveLength(1);
	expect(result[0].details.large).toHaveLength(1000);
});
test("identifier lists are bounded and nested objects cannot leak through", async () => {
	const result = await collectContributions(
		api((_event, q) =>
			q.reply({
				id: "models",
				version: 1,
				status: "ok",
				details: {
					models: Array.from({ length: 100 }, (_, i) => `provider/model-${i}`),
				},
			})
		),
		"s"
	);
	expect(result[0].details.models).toHaveLength(64);
	expect((result[0].details.models as string[])[0]).toBe("provider/model-0");
	const invalid = await collectContributions(
		api((_event, q) =>
			q.reply({
				id: "models",
				version: 1,
				status: "ok",
				details: {
					models: ["provider/ok", { secret: "fixture" } as never, "x".repeat(1001)],
				},
			})
		),
		"s"
	);
	expect(invalid[0].details.models).toEqual(["provider/ok"]);
});

test("hung contributors settle within bounded deadline", async () => {
	const result = await collectContributions(
		api((_event, q) => q.reply(new Promise(() => {}))),
		"s"
	);
	expect(result).toEqual([]);
});
test("caller abort settles and rejects", async () => {
	const controller = new AbortController();
	const pending = collectContributions(
		api((_event, q) => {
			q.reply(new Promise(() => {}));
			controller.abort();
		}),
		"s",
		controller.signal
	);
	await expect(pending).rejects.toThrow();
});
test("late reply is not admitted after synchronous query dispatch", async () => {
	let reply: StatusQuery["reply"] | undefined;
	const result = await collectContributions(
		api((_event, q) => {
			reply = q.reply;
		}),
		"s"
	);
	reply?.({ id: "late", version: 1, status: "ok", details: {} });
	expect(result).toEqual([]);
});

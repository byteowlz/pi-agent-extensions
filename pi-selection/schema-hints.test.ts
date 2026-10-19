import { expect, test } from "bun:test";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { TSchema } from "typebox";
import { Check } from "typebox/value";
import extension from "./index.js";
import { selectionSpecSchema } from "./schema.js";
import { normalizeSpec } from "./validation.js";

test("reported question.text mistake identifies the path and canonical title field", () => {
	expect(() =>
		normalizeSpec({
			version: 1,
			mode: "questions",
			title: "Topology",
			questions: [{ id: "topology", text: "Which host?", kind: "text" }],
		})
	).toThrow(/spec\.questions\[0\].*Use.*title/);
});
test("registered tool exposes canonical spec and rejects guessed fields", () => {
	let parameters: TSchema | undefined;
	const ignoreRegistration = () => {
		/* This test only captures the published tool interface. */
	};
	extension({
		registerFlag: ignoreRegistration,
		registerCommand: ignoreRegistration,
		on: ignoreRegistration,
		registerTool: (tool: { parameters: TSchema }) => {
			parameters = tool.parameters;
		},
	} as unknown as ExtensionAPI);
	const spec = {
		version: 1,
		mode: "questions",
		title: "Topology",
		questions: [{ id: "topology", title: "Which host?", kind: "single", options: [{ id: "local", label: "Local" }] }],
	};
	expect(Check(parameters as TSchema, { action: "ask", spec })).toBe(true);
	expect(
		Check(parameters as TSchema, {
			action: "ask",
			spec: { ...spec, questions: [{ id: "topology", text: "Which host?", kind: "text" }] },
		})
	).toBe(false);
	const serialized = JSON.stringify(parameters);
	expect(serialized).toContain("Question/prompt displayed");
	expect(serialized).toContain("Which host?");
	for (const valid of [
		{ ...spec, questions: [{ id: "text", title: "Explain", kind: "text", allowOther: false }] },
		{
			version: 1,
			mode: "review",
			title: "Review",
			items: [{ id: "repo", label: "Repository" }],
			choices: [{ id: "keep", label: "Keep" }],
		},
	]) {
		expect(Check(selectionSpecSchema, valid)).toBe(true);
		expect(() => normalizeSpec(valid)).not.toThrow();
	}
});

test("a missing question kind names the supported choices", () => {
	expect(() =>
		normalizeSpec({ version: 1, mode: "questions", title: "Topology", questions: [{ id: "topology", title: "Which host?" }] })
	).toThrow(/kind.*single.*multiple.*text/);
});

test("tool call line summarizes the spec instead of echoing raw JSON", () => {
	let tool: { renderCall?: (args: unknown, theme: unknown) => { render(width: number): string[] } } | undefined;
	const ignore = () => {
		/* Capture only the tool definition. */
	};
	extension({
		registerFlag: ignore,
		registerCommand: ignore,
		on: ignore,
		registerTool: (registered: typeof tool) => {
			tool = registered;
		},
	} as unknown as ExtensionAPI);
	const theme = { fg: (_color: string, value: string) => value };
	const spec = {
		version: 1,
		mode: "questions",
		title: "Topology",
		questions: [{ id: "q", title: "Which host?", kind: "single", options: [{ id: "a", label: "A" }] }],
	};
	const rendered = tool?.renderCall?.({ action: "ask", spec }, theme)?.render(80).join("\n") ?? "";
	expect(rendered).toContain("Selection · ask questions — Topology");
	expect(rendered).not.toContain('"questions"');
});

import { describe, expect, test } from "bun:test";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { CURSOR_MARKER, visibleWidth } from "@earendil-works/pi-tui";
import type { NormalizedSpec, SelectionRecord, TuiOutcome } from "./model.js";
import {
	createSelectionTuiState,
	filteredQuestionIndices,
	reduceSelectionTui,
	renderSelectionTui,
	safeSelectionText,
	showSelectionTui,
} from "./tui.js";

const spec: NormalizedSpec = {
	version: 1,
	mode: "questions",
	title: "Decisions",
	groups: [{ id: "g", title: "Group" }],
	questions: [
		{
			id: "single",
			title: "Single",
			kind: "single",
			required: true,
			allowOther: true,
			options: [
				{ id: "stable", label: "Recommended", recommended: true },
				{ id: "second", label: "Second" },
			],
			note: { label: "Reason", maxLength: 8 },
		},
		{
			id: "multi",
			title: "Multiple",
			kind: "multiple",
			minSelections: 2,
			maxSelections: 2,
			allowOther: true,
			options: [
				{ id: "one", label: "One" },
				{ id: "two", label: "Two" },
			],
			groupId: "g",
		},
		{ id: "text", title: "Text", kind: "text", multiline: true, maxLength: 12, note: { multiline: true } },
	],
};
function record(document = spec): SelectionRecord {
	return {
		version: 1,
		id: "selection",
		scopeId: "scope",
		revision: 0,
		state: "draft",
		spec: document,
		answers: Object.fromEntries(document.questions.map((q) => [q.id, { answered: false, selectedIds: [] }])),
		createdAt: "now",
		updatedAt: "now",
	};
}
const reduce = reduceSelectionTui;
describe("pure selection state", () => {
	test("dispositions survive all outcomes and reopen; notes do not turn them into decisions", () => {
		const document = { ...spec, questions: spec.questions.map((q) => ({ ...q, required: false })) };
		for (const status of ["skip", "unsure"] as const) {
			let state = reduce(createSelectionTuiState(record(document)), { type: "status", status });
			state = reduce(state, { type: "edit", field: "note" });
			state = reduce(state, { type: "value", value: "reason" });
			const disposition = status === "skip" ? "skipped" : "unsure";
			for (const type of ["submit", "browser", "cancel"] as const) {
				const outcome = reduce(reduce(state, { type: "review" }), { type }).outcome;
				expect(outcome?.answers.single.disposition).toBe(disposition);
				const reopened = createSelectionTuiState({ ...record(document), answers: outcome?.answers ?? {} });
				expect(reopened.statuses.single).toBe(status);
				expect(reopened.answers.single.note).toBe("reason");
				expect(reduce(reopened, { type: "choose" }).answers.single.disposition).toBeUndefined();
			}
		}
	});
	test("confirm none and optional blank text remain distinct from unanswered and disposition", () => {
		const document = { ...spec, questions: spec.questions.map((q) => ({ ...q, required: false, minSelections: undefined })) };
		let state = reduce(createSelectionTuiState(record(document)), { type: "navigate", delta: 1 });
		state = reduce(state, { type: "status", status: "unsure" });
		state = reduce(state, { type: "none" });
		expect(state.answers.multi.answered).toBe(true);
		expect(state.answers.multi.selectedIds).toEqual([]);
		expect(state.statuses.multi).toBeUndefined();
		state = reduce(state, { type: "navigate", delta: 1 });
		state = reduce(state, { type: "edit", field: "text" });
		state = reduce(state, { type: "value", value: "" });
		const outcome = reduce(reduce(state, { type: "review" }), { type: "submit" }).outcome;
		expect(outcome?.answers.multi).toEqual({ answered: true, selectedIds: [] });
		expect(outcome?.answers.text).toEqual({ answered: true, selectedIds: [], text: "" });
		expect(outcome?.answers.single).toEqual({ answered: false, selectedIds: [] });
		const reopened = createSelectionTuiState({ ...record(document), answers: outcome?.answers ?? {} });
		const screen = renderSelectionTui(reduce(reopened, { type: "review" }), 120).join("\n");
		expect(screen).toContain("None selected");
		expect(screen).toContain("(blank)");
		expect(screen).toContain("unanswered");
	});
	test("none clears choices/Other but preserves note and shared required/min validation", () => {
		const document = { ...spec, questions: [{ ...spec.questions[1], required: true, note: {} }] };
		let state = reduce(createSelectionTuiState(record(document)), { type: "choose" });
		state = reduce(state, { type: "edit", field: "text" });
		state = reduce(state, { type: "value", value: "Other" });
		state = reduce(state, { type: "edit", field: "note" });
		state = reduce(state, { type: "value", value: "reason" });
		state = reduce(state, { type: "finishEdit" });
		state = reduce(state, { type: "none" });
		expect(state.answers.multi.note).toBe("reason");
		expect(state.answers.multi.text).toBeUndefined();
		expect(reduce(reduce(state, { type: "review" }), { type: "submit" }).error).toBe("Empty answer");
		state = reduce(state, { type: "status", status: "skip" });
		expect(reduce(reduce(state, { type: "review" }), { type: "submit" }).error).toBe("Required answer missing");
		const review = createSelectionTuiState(record({ ...document, mode: "review" }));
		expect(reduce(review, { type: "none" }).answers).toEqual(review.answers);
	});
	test("recommendations are hints; stable IDs, backtracking and explicit submit", () => {
		const initial = createSelectionTuiState(record());
		expect(initial.answers.single.answered).toBe(false);
		let state = reduce(initial, { type: "choose", advance: true });
		expect(state.answers.single.selectedIds).toEqual(["stable"]);
		expect(state.index).toBe(1);
		state = reduce(state, { type: "navigate", delta: -1 });
		expect(state.answers.single.selectedIds).toEqual(["stable"]);
		state = reduce(state, { type: "move", delta: 1 });
		state = reduce(state, { type: "choose", advance: true });
		expect(state.answers.single.selectedIds).toEqual(["second"]);
		state = reduce(state, { type: "review" });
		expect(state.outcome).toBeUndefined();
		expect(reduce(state, { type: "submit" }).outcome?.action).toBe("submit");
		expect(initial.answers.single.selectedIds).toEqual([]);
	});
	test("supplemental note is not standalone text or a decision", () => {
		let state = reduce(createSelectionTuiState(record()), { type: "edit", field: "note" });
		state = reduce(state, { type: "value", value: "why" });
		expect(state.answers.single).toEqual({ answered: false, selectedIds: [], note: "why" });
		state = reduce(state, { type: "finishEdit" });
		state = reduce(state, { type: "review" });
		expect(reduce(state, { type: "submit" }).error).toBeTruthy();
	});
	test("Other replaces single but supplements multi, never synthetic IDs", () => {
		let state = reduce(createSelectionTuiState(record()), { type: "choose" });
		state = reduce(state, { type: "move", delta: 2 });
		state = reduce(state, { type: "choose" });
		expect(state.editing).toBe("text");
		state = reduce(state, { type: "value", value: "custom" });
		expect(state.answers.single).toEqual({ answered: true, selectedIds: [], text: "custom" });
		state = reduce(state, { type: "finishEdit" });
		state = reduce(state, { type: "navigate", delta: 1 });
		state = reduce(state, { type: "choose" });
		state = reduce(state, { type: "edit", field: "text" });
		state = reduce(state, { type: "value", value: "extra" });
		expect(state.answers.multi.selectedIds).toEqual(["one"]);
		expect(reduce(reduce(state, { type: "review" }), { type: "submit" }).outcome?.action).toBe("submit");
	});
	test("toggle, skip, unsure, reset retain note and have distinct UI statuses", () => {
		let state = createSelectionTuiState(record());
		state = reduce(state, { type: "edit", field: "note" });
		state = reduce(state, { type: "value", value: "reason" });
		state = reduce(state, { type: "choose" });
		state = reduce(state, { type: "status", status: "skip" });
		expect(state.statuses.single).toBe("skip");
		expect(state.answers.single).toEqual({ answered: false, selectedIds: [], note: "reason", disposition: "skipped" });
		expect(createSelectionTuiState({ ...record(), answers: state.answers }).statuses.single).toBe("skip");
		state = reduce(state, { type: "status", status: "unsure" });
		expect(state.statuses.single).toBe("unsure");
		state = reduce(state, { type: "status", status: "unanswered" });
		expect(state.statuses.single).toBeUndefined();
		state = reduce(state, { type: "navigate", delta: 1 });
		state = reduce(state, { type: "choose" });
		state = reduce(state, { type: "choose" });
		expect(state.answers.multi).toEqual({ answered: true, selectedIds: [] });
	});
	test("required, min/max and text/note length use shared submit validation", () => {
		let state = createSelectionTuiState(record());
		expect(reduce(reduce(state, { type: "review" }), { type: "submit" }).error).toBeTruthy();
		state = reduce(state, { type: "choose", advance: true });
		state = reduce(state, { type: "choose" });
		expect(reduce(reduce(state, { type: "review" }), { type: "submit" }).error).toBeTruthy();
		state = reduce(state, { type: "move", delta: 1 });
		state = reduce(state, { type: "choose" });
		state = reduce(state, { type: "edit", field: "text" });
		state = reduce(state, { type: "value", value: "third" });
		expect(reduce(reduce(state, { type: "review" }), { type: "submit" }).error).toBeTruthy();
		state = createSelectionTuiState(record());
		state = reduce(state, { type: "choose" });
		state = reduce(state, { type: "edit", field: "note" });
		state = reduce(state, { type: "value", value: "too long note" });
		expect(reduce(reduce(state, { type: "review" }), { type: "submit" }).error).toBeTruthy();
		state = createSelectionTuiState(record());
		state = reduce(state, { type: "choose" });
		state = reduce(state, { type: "navigate", delta: 2 });
		state = reduce(state, { type: "edit", field: "text" });
		state = reduce(state, { type: "value", value: "long standalone text" });
		expect(reduce(reduce(state, { type: "review" }), { type: "submit" }).error).toBeTruthy();
	});
	test("standalone multiline text and note are independent", () => {
		let state = reduce(createSelectionTuiState(record()), { type: "navigate", delta: 2 });
		state = reduce(state, { type: "edit", field: "text" });
		state = reduce(state, { type: "value", value: "first\nsecond" });
		state = reduce(state, { type: "edit", field: "note" });
		state = reduce(state, { type: "value", value: "note\nline" });
		expect(state.answers.text).toEqual({ answered: true, selectedIds: [], text: "first\nsecond", note: "note\nline" });
	});
	test("review searches inventory, navigates groups/list/detail, no item tabs", () => {
		let state = createSelectionTuiState(record({ ...spec, mode: "review" }));
		state = reduce(state, { type: "group", delta: 1 });
		expect(filteredQuestionIndices(state)).toEqual([1]);
		state = reduce(state, { type: "choose" });
		expect(state.listFocus).toBe(false);
		state = reduce(state, { type: "group", delta: -1 });
		state = reduce(state, { type: "edit", field: "search" });
		state = reduce(state, { type: "value", value: "text" });
		expect(filteredQuestionIndices(state)).toEqual([2]);
		expect(state.index).toBe(2);
		state = reduce(state, { type: "navigate", delta: 1 });
		expect(state.review).toBe(true);
		state = reduce(state, { type: "navigate", delta: -1 });
		expect(state.review).toBe(false);
		expect(state.index).toBe(2);
	});
	test("browser and cancel snapshot preserve drafts including custom text and notes", () => {
		let state = reduce(createSelectionTuiState(record()), { type: "edit", field: "text" });
		state = reduce(state, { type: "value", value: "draft" });
		for (const type of ["browser", "cancel"] as const) {
			const result = reduce(state, { type }).outcome;
			expect(result?.answers).toEqual(state.answers);
			expect(result?.answers).not.toBe(state.answers);
		}
	});
});

describe("bounded safe rendering", () => {
	test("narrow widths, unicode, untrusted escapes, long inventories and resize", () => {
		const malicious = "世界 👩‍💻 é\u001b]52;c;SECRET\u0007\u009b31m";
		const document = {
			...spec,
			title: malicious,
			mode: "review" as const,
			questions: Array.from({ length: 80 }, (_, i) => ({ ...spec.questions[0], id: `q${i}`, title: malicious.repeat(3) })),
		};
		let state = createSelectionTuiState(record(document));
		state = reduce(state, { type: "move", delta: 79 });
		for (const width of [0, 1, 2, 5, 20, 50, 100])
			for (const height of [1, 2, 5, 24]) {
				for (const screen of [state, reduce(state, { type: "review" })]) {
					const lines = renderSelectionTui(screen, width, height);
					expect(lines.length).toBeLessThanOrEqual(height);
					for (const line of lines) {
						expect(visibleWidth(line)).toBeLessThanOrEqual(width);
						expect(safeSelectionText(line)).toBe(line);
					}
				}
			}
		expect(renderSelectionTui(state, 100, 24).join("\n")).toContain("Detail");
	});
});

interface MockComponent {
	render(width: number): string[];
	handleInput(data: string): void;
	dispose?(): void;
}
function host(signal?: AbortSignal, mode = "tui", factoryThrows = false) {
	let component: MockComponent | undefined;
	let completions = 0;
	const ctx = {
		mode,
		signal,
		ui: {
			custom: (factory: (...args: unknown[]) => MockComponent) => {
				if (factoryThrows) throw new Error("factory failure");
				return new Promise<TuiOutcome>((resolve) => {
					component = factory(
						{
							terminal: { rows: 24 },
							requestRender() {
								/* Mock: rendering is pulled by tests. */
							},
						},
						{ fg: (_color: string, value: string) => value },
						{},
						(outcome: TuiOutcome) => {
							completions++;
							resolve(outcome);
						}
					);
				});
			},
		},
	} as unknown as ExtensionContext;
	return {
		ctx,
		component: () => {
			if (!component) throw new Error("No component");
			return component;
		},
		completions: () => completions,
	};
}
describe("mock native host", () => {
	test("0 confirms native multi none without submitting and remains literal while editing", async () => {
		const mock = host();
		const pending = showSelectionTui(mock.ctx, record());
		const component = mock.component();
		expect(component.render(240).join("\n")).toContain("0 confirm none");
		component.handleInput("\r");
		component.handleInput(" ");
		component.handleInput("0");
		expect(mock.completions()).toBe(0);
		expect(component.render(240).join("\n")).toContain("None selected");
		component.handleInput("e");
		component.handleInput("0");
		component.handleInput("\u000f");
		const outcome = await pending;
		expect(outcome.action).toBe("browser");
		expect(outcome.answers.multi).toEqual({ answered: true, selectedIds: [], text: "0" });
	});
	test("RPC rejected without custom; pre-abort does not mount", async () => {
		await expect(showSelectionTui(host(undefined, "rpc").ctx, record())).rejects.toThrow("native tui");
		const controller = new AbortController();
		controller.abort();
		const mock = host(controller.signal);
		expect((await showSelectionTui(mock.ctx, record())).action).toBe("cancel");
		expect(() => mock.component()).toThrow();
	});
	test("text owns letters/navigation; browser keeps live draft and note", async () => {
		const mock = host();
		const promise = showSelectionTui(mock.ctx, record());
		const component = mock.component();
		component.handleInput("e");
		component.handleInput("j");
		component.handleInput("n");
		component.handleInput("s");
		component.handleInput("u");
		component.handleInput("\r");
		component.handleInput("n");
		component.handleInput("why");
		component.handleInput("\u000f");
		const result = await promise;
		expect(result.action).toBe("browser");
		expect(result.answers.single.text).toBe("jnsu");
		expect(result.answers.single.note).toBe("why");
	});
	test("multiline editor newline and note; safe pasted escape and narrow render", async () => {
		const mock = host();
		const promise = showSelectionTui(mock.ctx, record());
		const component = mock.component();
		component.handleInput("\t");
		component.handleInput("\t");
		component.handleInput("e");
		component.handleInput("line");
		component.handleInput("\r");
		component.handleInput("two");
		for (const width of [0, 1, 5, 40]) {
			for (const line of component.render(width)) expect(visibleWidth(line)).toBeLessThanOrEqual(width);
		}
		component.handleInput("\u000f");
		expect((await promise).answers.text.text).toBe("line\ntwo");
		const single = host();
		const draft = showSelectionTui(single.ctx, record());
		const editor = single.component();
		editor.handleInput("e");
		editor.handleInput("\u001b[200~a\u001b]52;c;bad\u0007b\u001b[201~");
		expect(editor.render(60).join("\n").replaceAll(CURSOR_MARKER, "")).not.toContain("\u001b]52");
		editor.handleInput("\u001b");
		const text = (await draft).answers.single.text ?? "";
		expect(safeSelectionText(text)).toBe(text);
	});
	test("abort completes once and cleans listener, preserving live editor draft", async () => {
		const controller = new AbortController();
		let added = 0;
		let removed = 0;
		const add = controller.signal.addEventListener.bind(controller.signal);
		const remove = controller.signal.removeEventListener.bind(controller.signal);
		controller.signal.addEventListener = (...args: Parameters<AbortSignal["addEventListener"]>) => {
			added++;
			add(...args);
		};
		controller.signal.removeEventListener = (...args: Parameters<AbortSignal["removeEventListener"]>) => {
			removed++;
			remove(...args);
		};
		const mock = host(controller.signal);
		const promise = showSelectionTui(mock.ctx, record());
		mock.component().handleInput("e");
		mock.component().handleInput("draft");
		controller.abort();
		const result = await promise;
		expect(result.action).toBe("cancel");
		expect(result.answers.single.text).toBe("draft");
		mock.component().handleInput("\u000f");
		expect(mock.completions()).toBe(1);
		expect(added).toBe(1);
		expect(removed).toBeGreaterThanOrEqual(1);
	});
	test("factory failure after mounting still removes abort listener", async () => {
		const controller = new AbortController();
		let removed = 0;
		const remove = controller.signal.removeEventListener.bind(controller.signal);
		controller.signal.removeEventListener = (...args: Parameters<AbortSignal["removeEventListener"]>) => {
			removed++;
			remove(...args);
		};
		const mock = host(controller.signal);
		const custom = mock.ctx.ui.custom.bind(mock.ctx.ui);
		mock.ctx.ui.custom = ((factory: Parameters<typeof custom>[0]) => {
			void custom(factory);
			throw new Error("mount failed");
		}) as typeof custom;
		await expect(showSelectionTui(mock.ctx, record())).rejects.toThrow("mount failed");
		expect(removed).toBe(1);
		controller.abort();
		expect(mock.completions()).toBe(0);
	});
	test("cancel and submit explicit review; failed required submit stays mounted", async () => {
		const mock = host();
		const promise = showSelectionTui(mock.ctx, record());
		mock.component().handleInput("r");
		mock.component().handleInput("\r");
		expect(mock.completions()).toBe(0);
		expect(mock.component().render(80).join("\n")).toContain("Error:");
		mock.component().handleInput("\u001b");
		expect((await promise).action).toBe("cancel");
		const submitted = host();
		const result = showSelectionTui(submitted.ctx, record());
		submitted.component().handleInput("\r");
		expect(submitted.completions()).toBe(0);
		submitted.component().handleInput("r");
		submitted.component().handleInput("\r");
		expect((await result).action).toBe("submit");
	});
});

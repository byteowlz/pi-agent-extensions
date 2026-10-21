import type { ExtensionContext, Theme } from "@earendil-works/pi-coding-agent";
import { CURSOR_MARKER, type Color, Editor, Input, Key, matchesKey, truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import type { Answer, Answers, NormalizedSpec, SelectionRecord, TuiOutcome } from "./model.js";
import { validateAnswers } from "./validation.js";

export type EditField = "text" | "note" | "search";
export interface SelectionTuiState {
	spec: NormalizedSpec;
	answers: Answers;
	index: number;
	option: number;
	review: boolean;
	listFocus: boolean;
	search: string;
	group: string | undefined;
	editing?: EditField;
	statuses: Record<string, "skip" | "unsure">;
	error?: string;
	outcome?: TuiOutcome;
}
export type SelectionTuiAction =
	| { type: "navigate"; delta: number }
	| { type: "move"; delta: number }
	| { type: "group"; delta: number }
	| { type: "choose"; advance?: boolean }
	| { type: "none" }
	| { type: "edit"; field: EditField }
	| { type: "value"; value: string }
	| { type: "finishEdit" }
	| { type: "status"; status: "skip" | "unsure" | "unanswered" }
	| { type: "review" }
	| { type: "list" }
	| { type: "submit" }
	| { type: "cancel" | "browser" };

const blank = (): Answer => ({ answered: false, selectedIds: [] });
export function createSelectionTuiState(record: SelectionRecord): SelectionTuiState {
	return {
		spec: record.spec,
		answers: structuredClone(record.answers),
		index: 0,
		option: 0,
		review: false,
		listFocus: record.spec.mode === "review",
		search: "",
		group: undefined,
		statuses: Object.fromEntries(
			Object.entries(record.answers).flatMap(([id, answer]) =>
				answer.disposition ? [[id, answer.disposition === "skipped" ? "skip" : "unsure"]] : []
			)
		),
	};
}
export function filteredQuestionIndices(state: SelectionTuiState): number[] {
	const query = state.search.toLocaleLowerCase();
	return state.spec.questions.flatMap((q, i) =>
		(!state.group || q.groupId === state.group) && `${q.title} ${q.description ?? ""} ${q.id}`.toLocaleLowerCase().includes(query)
			? [i]
			: []
	);
}
const OWN_ROW_OFFSET = 0;
const NONE_ROW_OFFSET = 1;
/** Option rows plus the always-visible own-answer and none-of-the-above rows. */
function choiceRowCount(q: NormalizedSpec["questions"][number] | undefined): number {
	if (!q || q.kind === "text") return 0;
	return (q.options?.length ?? 0) + 2;
}
function ownRowIndex(q: NormalizedSpec["questions"][number]): number {
	return (q.options?.length ?? 0) + OWN_ROW_OFFSET;
}
function noneRowIndex(q: NormalizedSpec["questions"][number]): number {
	return (q.options?.length ?? 0) + NONE_ROW_OFFSET;
}

function advance(state: SelectionTuiState): SelectionTuiState {
	if (state.spec.mode === "review") return { ...state, listFocus: true };
	return state.index + 1 < state.spec.questions.length
		? { ...state, index: state.index + 1, option: 0 }
		: { ...state, review: true };
}
/** No terminal or host side effects. Only explicit submit invokes the shared validator. */
export function reduceSelectionTui(state: SelectionTuiState, action: SelectionTuiAction): SelectionTuiState {
	if (state.outcome) return state;
	const next = { ...state, error: undefined };
	const q = state.spec.questions[state.index];
	switch (action.type) {
		case "cancel":
		case "browser":
			return { ...next, outcome: { action: action.type, answers: structuredClone(state.answers) } };
		case "submit":
			if (!state.review) return { ...next, review: true, editing: undefined };
			try {
				return { ...next, outcome: { action: "submit", answers: validateAnswers(state.spec, state.answers, true) } };
			} catch (error) {
				return { ...next, error: error instanceof Error ? error.message : "Invalid answers" };
			}
		case "review":
			return { ...next, review: true, editing: undefined };
		case "list":
			return { ...next, review: false, listFocus: true, editing: undefined };
		case "navigate":
			return navigateSelection(next, action.delta);
		case "group": {
			const groups = [undefined, ...state.spec.groups.map((g) => g.id)];
			next.group = groups[(groups.indexOf(state.group) + action.delta + groups.length) % groups.length];
			next.index = filteredQuestionIndices(next)[0] ?? state.index;
			return { ...next, option: 0, listFocus: true };
		}
		case "move": {
			if (state.review)
				return { ...next, index: Math.max(0, Math.min(state.spec.questions.length - 1, state.index + action.delta)) };
			if (state.spec.mode === "review" && state.listFocus) {
				const indices = filteredQuestionIndices(state);
				const position = Math.max(0, indices.indexOf(state.index));
				return {
					...next,
					index: indices[Math.max(0, Math.min(indices.length - 1, position + action.delta))] ?? state.index,
					option: 0,
				};
			}
			const count = choiceRowCount(q);
			return { ...next, option: Math.max(0, Math.min(count - 1, state.option + action.delta)) };
		}
		default:
			return reduceDecision(next, action);
	}
}

function navigateSelection(state: SelectionTuiState, delta: number): SelectionTuiState {
	if (state.spec.mode === "review") return { ...state, review: !state.review, listFocus: true, editing: undefined };
	const count = state.spec.questions.length + 1;
	const tab = state.review && delta < 0 ? state.index : ((state.review ? count - 1 : state.index) + delta + count) % count;
	return { ...state, index: tab === count - 1 ? state.index : tab, review: tab === count - 1, option: 0, editing: undefined };
}

function canEdit(state: SelectionTuiState, field: EditField): boolean {
	const q = state.spec.questions[state.index];
	if (field === "search") return state.spec.mode === "review";
	if (field === "note") return !!q?.note;
	return !!q;
}

function withoutNone(a: Answer): Answer {
	const clone: Answer = { answered: a.answered, selectedIds: [...a.selectedIds] };
	if (a.text !== undefined) clone.text = a.text;
	if (a.note !== undefined) clone.note = a.note;
	if (a.disposition !== undefined) clone.disposition = a.disposition;
	return clone;
}

function textAnswer(a: Answer, q: NormalizedSpec["questions"][number], value: string): Answer {
	return {
		...withoutNone(a),
		selectedIds: q.kind === "single" ? [] : a.selectedIds,
		text: value,
		answered: q.kind === "text" || !!value.trim() || (q.kind === "multiple" && a.selectedIds.length > 0),
	};
}

function saveDecision(state: SelectionTuiState, id: string | undefined, answer: Answer): void {
	if (!id) return;
	const normalized = { ...answer, disposition: answer.answered ? undefined : answer.disposition };
	state.answers = { ...state.answers, [id]: normalized };
	state.statuses = Object.fromEntries(Object.entries(state.statuses).filter(([key]) => key !== id));
	if (normalized.disposition) state.statuses[id] = normalized.disposition === "skipped" ? "skip" : "unsure";
}

/** Decision edits share one save path: answered clears disposition, notes preserve it. */
function reduceDecision(state: SelectionTuiState, action: SelectionTuiAction): SelectionTuiState {
	const next = { ...state };
	const q = state.spec.questions[state.index];
	const a = q ? (state.answers[q.id] ?? blank()) : blank();
	const save = (answer: Answer) => saveDecision(next, q?.id, answer);
	switch (action.type) {
		case "none":
			if (!state.review && !state.listFocus && q && q.kind !== "text")
				save({
					answered: true,
					selectedIds: [],
					none: true,
					...(a.note === undefined ? {} : { note: a.note }),
				});
			return next;
		case "edit":
			if (!canEdit(state, action.field)) return next;
			return { ...next, editing: action.field };
		case "value":
			return updateEditedValue(next, action.value);
		case "finishEdit":
			return { ...next, editing: undefined };
		case "status":
			save({
				answered: false,
				selectedIds: [],
				...(a.note === undefined ? {} : { note: a.note }),
				...(action.status === "unanswered" ? {} : { disposition: action.status === "skip" ? "skipped" : "unsure" }),
			});
			if (q && action.status !== "unanswered") next.statuses[q.id] = action.status;
			return next;
		case "choose":
			return chooseDecision(state, action, save, next);
		default:
			return next;
	}
}

function updateEditedValue(state: SelectionTuiState, value: string): SelectionTuiState {
	if (state.editing === "search") {
		const next = { ...state, search: value };
		return { ...next, index: filteredQuestionIndices(next)[0] ?? state.index, option: 0 };
	}
	const q = state.spec.questions[state.index];
	if (!q) return state;
	const a = state.answers[q.id] ?? blank();
	if (state.editing === "note") saveDecision(state, q.id, { ...a, note: value });
	if (state.editing === "text") saveDecision(state, q.id, textAnswer(a, q, value));
	return state;
}

function chooseDecision(
	state: SelectionTuiState,
	action: Extract<SelectionTuiAction, { type: "choose" }>,
	save: (answer: Answer) => void,
	next: SelectionTuiState
): SelectionTuiState {
	const q = state.spec.questions[state.index];
	const a = q ? (state.answers[q.id] ?? blank()) : blank();
	if (state.review) return reduceSelectionTui(state, { type: "submit" });
	if (state.spec.mode === "review" && state.listFocus)
		return filteredQuestionIndices(state).length ? { ...next, listFocus: false } : next;
	if (!q) return next;
	if (q.kind === "text" || state.option === ownRowIndex(q)) return { ...next, editing: "text" };
	if (state.option === noneRowIndex(q)) {
		save({
			answered: true,
			selectedIds: [],
			none: true,
			...(a.note === undefined ? {} : { note: a.note }),
		});
		return next;
	}
	const choice = q.options?.[state.option];
	if (!choice) return next;
	const rest = withoutNone(a);
	const ids =
		q.kind === "single"
			? [choice.id]
			: rest.selectedIds.includes(choice.id)
				? rest.selectedIds.filter((id) => id !== choice.id)
				: [...rest.selectedIds, choice.id];
	save({
		...rest,
		selectedIds: ids,
		...(q.kind === "single" ? { text: undefined } : {}),
		answered: q.kind === "multiple" || ids.length > 0,
	});
	return q.kind === "single" && action.advance ? advance(next) : next;
}

/** Strip control codes (including OSC/CSI introductions), never interpret document ANSI. */
export function safeSelectionText(text: string): string {
	return safeEditorText(text, false);
}
function summary(state: SelectionTuiState, id: string): string {
	const a = state.answers[id] ?? blank();
	const q = state.spec.questions.find((question) => question.id === id);
	if (!a.answered) return state.statuses[id] ?? "unanswered";
	if (a.none) return "None of the above";
	if (!a.selectedIds.length && !a.text?.trim()) return q?.kind === "text" ? "(blank)" : "None selected";
	return [...a.selectedIds.map((option) => q?.options?.find((c) => c.id === option)?.label ?? option), a.text]
		.filter(Boolean)
		.join(", ");
}
export type SelectionPaintRole =
	| "plain"
	| "plainMuted"
	| "panel"
	| "panelMuted"
	| "panelAccent"
	| "panelStrong"
	| "panelActive"
	| "panelPicked";
export type SelectionPaint = (text: string, role: SelectionPaintRole) => string;
const plainPaint: SelectionPaint = (text) => text;

/**
 * Build a painter for the question block.
 *
 * The panel keeps only a faint warm tint: a stronger yellow mix turned into a
 * muddy olive that destroyed contrast for muted text and accent. Body text stays
 * at full `text` contrast; `muted` is reserved for chrome (tab strip, hints).
 */
export function selectionPaint(theme: Theme | undefined, width: number): SelectionPaint {
	const colors = theme?.colors as Record<string, Color> | undefined;
	if (!theme || !colors?.toolPendingBg || typeof theme.style !== "function") return plainPaint;
	const panelBg = colors.toolPendingBg;
	const bar = (text: string) => theme.fg("accent", text);
	// Leave room for the accent bars on both sides; narrow terminals degrade to plain.
	const bodyWidth = Math.max(0, width - 2);
	return (text, role) => {
		if (role === "plain") return text;
		if (role === "plainMuted") return theme.fg("muted", text);
		const padded = `${text}${" ".repeat(Math.max(0, bodyWidth - visibleWidth(text)))}`;
		if (bodyWidth < 8) return padded;
		if (role === "panelActive")
			return `${bar("┃")}${theme.style(padded, { bg: colors.selectedBg ?? panelBg, fg: "text", bold: true })}${bar("┃")}`;
		if (role === "panelPicked") return `${bar("┃")}${theme.style(padded, { bg: panelBg, fg: "success" })}${bar("┃")}`;
		if (role === "panelMuted") return `${bar("┃")}${theme.style(padded, { bg: panelBg, fg: "muted" })}${bar("┃")}`;
		if (role === "panelAccent") return `${bar("┃")}${theme.style(padded, { bg: panelBg, fg: "accent", bold: true })}${bar("┃")}`;
		if (role === "panelStrong") return `${bar("┃")}${theme.style(padded, { bg: panelBg, fg: "text", bold: true })}${bar("┃")}`;
		return `${bar("┃")}${theme.style(padded, { bg: panelBg, fg: "text" })}${bar("┃")}`;
	};
}

interface RenderLine {
	text: string;
	role: SelectionPaintRole;
}

/** Bounded by both terminal dimensions, with a scrolling inventory and option viewport. */
export function renderSelectionTui(
	state: SelectionTuiState,
	width: number,
	height = 24,
	paint: SelectionPaint = plainPaint
): string[] {
	const w = Math.max(0, Math.floor(width));
	const h = Math.max(1, Math.floor(height));
	const fit = (text: string, size = w) => truncateToWidth(safeSelectionText(text), size, "").replaceAll("\u001b[0m", "");
	const lines: RenderLine[] = [
		{ text: ` ${state.spec.title}`, role: "panelStrong" },
		{ text: "", role: "panel" },
	];
	const q = state.spec.questions[state.index];
	const footer = fit(
		state.editing
			? "Enter done · multiline: Enter newline, Ctrl+Enter done · Esc cancel · Ctrl+o browser"
			: w >= 118
				? "Tab/Shift+Tab navigate · Enter choose/submit · Space multi · e own answer · 0 none · n note · s skip · u unsure · Esc cancel · Ctrl+o browser"
				: w >= 80
					? "Enter choose · Space multi · e own · 0 none · n note · s skip · u unsure · Esc cancel"
					: "Enter choose · e own · 0 none · Esc cancel"
	);
	if (state.review) {
		lines.push({ text: "Review / Submit — Enter explicitly submits; Shift+Tab back", role: "panelMuted" });
		const slots = Math.max(1, h - 7);
		const start = Math.max(0, state.index - Math.floor(slots / 2));
		for (const question of state.spec.questions.slice(start, start + slots))
			lines.push({
				text: `${question.id === state.spec.questions[state.index]?.id ? "> " : " "} ${question.title}: ${summary(state, question.id)}${state.answers[question.id]?.note ? ` | Note: ${state.answers[question.id].note}` : ""}`,
				role: "panel",
			});
	} else if (q) {
		lines.push(...renderQuestion(state, w, h, fit));
	}
	// Bottom padding keeps the panel band from ending flush against the hint line.
	lines.push({ text: "", role: "panel" });
	const body = lines.slice(0, Math.max(0, h - 2));
	body.push({ text: selectionFocusLabel(state), role: "plainMuted" });
	body.push({ text: footer, role: "plainMuted" });
	return body.slice(-h).map((line) => paint(fit(line.text), line.role));
}

function selectionFocusLabel(state: SelectionTuiState): string {
	if (state.error) return `Error: ${state.error}`;
	if (state.editing) return `Editing ${state.editing}`;
	return state.listFocus && !state.review ? "List focus: Enter opens detail" : "Detail focus";
}

function renderQuestion(
	state: SelectionTuiState,
	w: number,
	h: number,
	fit: (text: string, size?: number) => string
): RenderLine[] {
	const lines: RenderLine[] = [];
	const q = state.spec.questions[state.index];
	if (state.spec.mode === "questions") {
		// Windowed tabs, never one tab per review inventory item.
		const label = (question: (typeof state.spec.questions)[number]): string => {
			const raw = (question.header ?? question.title).replace(/\s+/g, " ").trim();
			return raw.length > 18 ? `${raw.slice(0, 17)}…` : raw;
		};
		const tabs = state.spec.questions
			.slice(Math.max(0, state.index - 1), state.index + 2)
			.map((question) => (question.id === q.id ? `[${label(question)}]` : ` ${label(question)} `));
		lines.push({ text: ` ${state.index + 1}/${state.spec.questions.length} · ${tabs.join(" · ")} · Review`, role: "panelMuted" });
		lines.push({ text: "", role: "panel" });
	} else {
		lines.push({
			text: ` Inventory / Detail | Group: ${state.spec.groups.find((g) => g.id === state.group)?.title ?? "All"} | Search: ${state.search} | / search, ←→ group, b list, r review`,
			role: "panelMuted",
		});
	}
	const answer = state.answers[q.id] ?? blank();
	const multiHint = q.kind === "multiple" ? "  (select all that apply)" : "";
	lines.push({ text: ` ${q.title}${q.required ? "  * required" : ""}${multiHint}`, role: "panel" });
	if (q.description) lines.push({ text: ` ${q.description}`, role: "panel" });
	lines.push({ text: ` Decision: ${summary(state, q.id)}`, role: "panel" });
	lines.push({ text: "", role: "panel" });
	const rows = choiceRows(state, q, answer);
	const slots = Math.max(1, h - 10);
	const start = Math.max(0, state.option - Math.floor(slots / 2));
	lines.push(...rows.slice(start, start + slots));
	lines.push(...renderSupplement(state));
	if (state.spec.mode === "review") return renderInventory(state, lines, slots, w, fit);
	return lines;
}

function choiceRows(state: SelectionTuiState, q: NormalizedSpec["questions"][number], answer: Answer): RenderLine[] {
	const rows: RenderLine[] = [];
	const row = (index: number, label: string, picked: boolean): RenderLine => ({
		text: ` ${index === state.option ? "▸" : " "} ${index + 1}. ${label}`,
		role: index === state.option ? "panelActive" : picked ? "panelPicked" : "panel",
	});
	for (const [index, choice] of (q.options ?? []).entries()) {
		const picked = answer.selectedIds.includes(choice.id);
		rows.push(row(index, `${choice.label}${choice.recommended ? "  ★ recommended" : ""}${picked ? "  ✓" : ""}`, picked));
	}
	if (q.kind === "text") return rows;
	rows.push(row(ownRowIndex(q), "✎ Enter your own answer…", !!answer.text?.trim()));
	rows.push(row(noneRowIndex(q), "— None of the above", !!answer.none));
	return rows;
}

function renderSupplement(state: SelectionTuiState): RenderLine[] {
	const q = state.spec.questions[state.index];
	const answer = state.answers[q.id] ?? blank();
	const lines: RenderLine[] = [];
	const description = q.options?.[state.option]?.description;
	if (description) {
		lines.push({ text: "", role: "panel" });
		lines.push({ text: ` ${description}`, role: "panelMuted" });
	}
	if (q.kind === "text") lines.push({ text: ` Text: ${answer.text ?? ""} (e to edit)`, role: "panel" });
	else if (answer.text?.trim()) lines.push({ text: ` Own answer: ${answer.text} (e to edit, Enter clears)`, role: "panel" });
	if (q.note) lines.push({ text: ` ${q.note.label ?? "Note"}: ${answer.note ?? ""} (n to edit)`, role: "panel" });
	return lines;
}

function renderInventory(
	state: SelectionTuiState,
	detail: RenderLine[],
	slots: number,
	w: number,
	fit: (text: string, size?: number) => string
): RenderLine[] {
	const lines: RenderLine[] = [];
	const indices = filteredQuestionIndices(state);
	const position = Math.max(0, indices.indexOf(state.index));
	const listStart = Math.max(0, position - Math.floor(slots / 2));
	const inventory = indices
		.slice(listStart, listStart + slots)
		.map(
			(i) => `${i === state.index ? ">" : " "} ${state.spec.questions[i].title}: ${summary(state, state.spec.questions[i].id)}`
		);
	if (!indices.length) inventory.push("No matches");
	if (w >= 50) {
		const left = Math.floor(w * 0.4);
		for (let i = 0; i < Math.max(detail.length, inventory.length); i++) {
			const cell = fit(inventory[i] ?? "", left);
			lines.push({
				text: `${cell}${" ".repeat(Math.max(0, left - visibleWidth(cell)))} | ${fit(detail[i]?.text ?? "", w - left - 3)}`,
				role: detail[i]?.role ?? "panelMuted",
			});
		}
	} else {
		lines.push(...inventory.slice(0, Math.max(1, Math.floor(slots / 2))).map((text) => ({ text, role: "panelMuted" as const })));
		lines.push({ text: "Detail:", role: "panelMuted" }, ...detail);
	}
	return lines;
}

/** Native-only; RPC custom() is unsupported. Owns no persistence or browser process. */
export async function showSelectionTui(ctx: ExtensionContext, record: SelectionRecord): Promise<TuiOutcome> {
	if (ctx.mode !== "tui") throw new Error("Selection TUI requires native tui mode; RPC custom() is unsupported");
	let state = createSelectionTuiState(record);
	if (ctx.signal?.aborted) return { action: "cancel", answers: state.answers };
	let detach = () => {
		/* No listener until the custom factory mounts. */
	};
	try {
		return await ctx.ui.custom<TuiOutcome>((tui, theme, _kb, done) => {
			let completed = false;
			let input: Input | Editor | undefined;
			let focused = true;
			const dispatch = (action: SelectionTuiAction) => {
				if (completed) return;
				state = reduceSelectionTui(state, action);
				if (state.outcome) {
					completed = true;
					detach();
					done(state.outcome);
				} else tui.requestRender();
			};
			const abort = () => dispatch({ type: "cancel" });
			ctx.signal?.addEventListener("abort", abort, { once: true });
			detach = () => ctx.signal?.removeEventListener("abort", abort);
			const beginEdit = (field: EditField) => {
				dispatch({ type: "edit", field });
				if (!state.editing) return;
				const q = state.spec.questions[state.index];
				const multiline = field === "note" ? q?.note?.multiline : field === "text" && q?.multiline;
				const value = field === "search" ? state.search : (state.answers[q.id]?.[field] ?? "");
				if (multiline) {
					const editor = new Editor(tui, {
						borderColor: (s) => theme.fg("accent", s),
						selectList: {
							selectedPrefix: (s) => theme.fg("accent", s),
							selectedText: (s) => theme.fg("accent", s),
							description: (s) => theme.fg("muted", s),
							scrollInfo: (s) => theme.fg("dim", s),
							noMatch: (s) => theme.fg("warning", s),
						},
					});
					editor.setText(safeEditorText(value, true));
					input = editor;
				} else {
					const line = new Input();
					line.setValue(safeEditorText(value, false));
					input = line;
				}
				input.focused = focused;
			};
			const sync = () => {
				if (!input) return;
				const raw = input instanceof Input ? input.getValue() : input.getExpandedText();
				const value = safeEditorText(raw, input instanceof Editor);
				if (raw !== value) {
					if (input instanceof Input) input.setValue(value);
					else input.setText(value);
				}
				dispatch({ type: "value", value });
			};
			const finishEdit = () => {
				sync();
				dispatch({ type: "finishEdit" });
				input = undefined;
			};
			const editInput = (data: string): boolean => {
				if (!state.editing || !input) return false;
				const q = state.spec.questions[state.index];
				const multiline = state.editing === "note" ? q?.note?.multiline : state.editing === "text" && q?.multiline;
				if (matchesKey(data, Key.ctrl("enter")) || (!multiline && matchesKey(data, Key.enter))) finishEdit();
				else {
					// Letters, Tab and navigation belong exclusively to the text widget.
					input.handleInput(multiline && matchesKey(data, Key.enter) ? "\u001b\r" : data);
					sync();
				}
				return true;
			};
			const choose = (advance = false) => {
				dispatch({ type: "choose", advance });
				if (state.editing) beginEdit(state.editing);
			};
			const enter = () => {
				if (state.review) dispatch({ type: "submit" });
				else if (!state.listFocus && state.spec.questions[state.index]?.kind === "multiple")
					dispatch(state.spec.mode === "review" ? { type: "list" } : { type: "navigate", delta: 1 });
				else choose(true);
			};
			// Catch an abort between the preflight check and listener registration.
			if (ctx.signal?.aborted) abort();
			return {
				get focused() {
					return focused;
				},
				set focused(value: boolean) {
					focused = value;
					if (input) input.focused = value;
				},
				invalidate() {
					input?.invalidate();
				},
				dispose() {
					detach();
				},
				render(width: number) {
					const height = Math.max(1, tui.terminal.rows - 2);
					const paint = selectionPaint(theme, width);
					if (!state.editing || !input) return renderSelectionTui(state, width, height, paint);
					const available = Math.max(1, Math.min(6, height - 3));
					const header = renderSelectionTui(state, width, Math.max(1, height - available - 1), paint);
					// Built-in editors own their cursor and horizontal/vertical scrolling.
					const rendered = input.render(Math.max(1, width));
					const cursorLine = Math.max(
						0,
						rendered.findIndex((line) => line.includes(CURSOR_MARKER))
					);
					const start = Math.max(0, cursorLine - available + 1);
					const editorLines = rendered
						.slice(start, start + available)
						.map((line) => truncateToWidth(line, Math.max(0, width), ""));
					return [...header.slice(0, Math.max(0, height - editorLines.length)), ...editorLines];
				},
				handleInput(data: string) {
					if (completed) return;
					if (matchesKey(data, Key.escape)) {
						sync();
						dispatch({ type: "cancel" });
						return;
					}
					if (matchesKey(data, Key.ctrl("o"))) {
						sync();
						dispatch({ type: "browser" });
						return;
					}
					if (editInput(data)) return;
					const action = selectionKeyAction(state, data);
					if (action?.type === "edit") beginEdit(action.field);
					else if (action?.type === "choose") choose();
					else if (action) dispatch(action);
					else if (matchesKey(data, Key.enter)) enter();
				},
			};
		});
	} finally {
		detach();
	}
}
/** Application keys are consulted only after the native editor has declined ownership. */
function selectionKeyAction(state: SelectionTuiState, data: string): SelectionTuiAction | undefined {
	const movement: [Parameters<typeof matchesKey>[1], SelectionTuiAction][] = [
		[Key.tab, { type: "navigate", delta: 1 }],
		[Key.shift("tab"), { type: "navigate", delta: -1 }],
		[Key.up, { type: "move", delta: -1 }],
		[Key.down, { type: "move", delta: 1 }],
	];
	const matched = movement.find(([key]) => matchesKey(data, key));
	if (matched) return matched[1];
	if (data === "k" || data === "j") return { type: "move", delta: data === "k" ? -1 : 1 };
	if (data === "r") return { type: "review" };
	if (state.spec.mode === "review") {
		if (matchesKey(data, Key.left)) return { type: "group", delta: -1 };
		if (matchesKey(data, Key.right)) return { type: "group", delta: 1 };
		if (data === "/") return { type: "edit", field: "search" };
		if (data === "b") return { type: "list" };
	}
	return detailKeyAction(state, data);
}

function detailKeyAction(state: SelectionTuiState, data: string): SelectionTuiAction | undefined {
	if (state.review) return undefined;
	const actions: Record<string, SelectionTuiAction> = {
		e: { type: "edit", field: "text" },
		n: { type: "edit", field: "note" },
		s: { type: "status", status: "skip" },
		u: { type: "status", status: "unsure" },
		"?": { type: "status", status: "unanswered" },
	};
	if (Object.hasOwn(actions, data)) return actions[data];
	if (state.listFocus || state.spec.questions[state.index]?.kind === "text") return undefined;
	if (data === "0") return { type: "none" };
	if (data === " ") return { type: "choose" };
	return undefined;
}

function safeEditorText(value: string, multiline: boolean): string {
	return Array.from(value, (char) => {
		const code = char.charCodeAt(0);
		if (multiline && code === 10) return char;
		return code < 32 || (code >= 127 && code <= 159) ? " " : char;
	}).join("");
}

/**
 * Pure keyboard reducer for an interactive OpenUI part. Key + state -> next
 * state, or a finished outcome with the evaluated @Answer value.
 */
import { evaluate } from "@openuidev/lang-core";
import type { Control, ViewState } from "./render.js";

export type Key =
	| "tab"
	| "shift-tab"
	| "up"
	| "down"
	| "left"
	| "right"
	| "enter"
	| "space"
	| "escape"
	| "backspace"
	| { char: string };
export type Outcome = { kind: "answer"; value: unknown } | { kind: "event"; type: string; params: unknown } | { kind: "cancel" };

type Ast = { k?: string; name?: string; args?: unknown[]; mappedProps?: Record<string, unknown>; steps?: unknown[] };

/** Evaluate an OpenUI action with the current form state. Only the first terminal step resolves the part. */
export function evaluateAction(action: unknown, values: Record<string, unknown>): Outcome | undefined {
	const steps = actionSteps(action);
	const ctx = { getState: (name: string) => values[name] ?? null, resolveRef: () => null };
	for (const step of steps) {
		const name = step.name ?? "";
		if (name === "Set" || name === "Reset") continue; // local state changes are handled by the host renderer
		const params = Object.fromEntries(Object.entries(step.mappedProps ?? {}).map(([k, v]) => [k, evaluate(v as never, ctx)]));
		if (name === "Answer") return { kind: "answer", value: params.value ?? null };
		return { kind: "event", type: name, params };
	}
	return undefined;
}

function actionSteps(action: unknown): Ast[] {
	const a = action as Ast | undefined;
	if (!a) return [];
	if (a.k === "Comp" && a.name === "Action")
		return (a.args ?? []).flatMap((x) => ((x as Ast).k === "Arr" ? ((x as { v?: unknown[] }).v ?? []) : [x])) as Ast[];
	if (a.k === "Comp") return [a];
	if (Array.isArray(a.steps)) return a.steps as Ast[];
	return [];
}

export function reduce(state: ViewState, controls: Control[], key: Key): { state: ViewState; outcome?: Outcome } {
	const s: ViewState = { ...state, values: { ...state.values }, selected: { ...state.selected }, tables: { ...state.tables } };
	const n = controls.length;
	const current = controls[s.focus];

	if (s.editing) return reduceEditing(s, controls, key);

	if (key === "escape") return { state: s, outcome: { kind: "cancel" } };
	if (!n) return { state: s };
	if (key === "tab" || (key === "down" && current?.kind !== "choice" && current?.kind !== "accordion"))
		return { state: { ...s, focus: (s.focus + 1) % n } };
	if (key === "shift-tab" || (key === "up" && current?.kind !== "choice" && current?.kind !== "accordion"))
		return { state: { ...s, focus: (s.focus - 1 + n) % n } };
	if (!current) return { state: s };

	return reduceControl(s, current, n, key);
}

const PRESS = new Set<Key>(["enter", "space"]);

function reduceControl(s: ViewState, current: Control, n: number, key: Key): { state: ViewState; outcome?: Outcome } {
	switch (current.kind) {
		case "button": {
			const outcome = PRESS.has(key) ? evaluateAction(current.action, s.values) : undefined;
			return outcome ? { state: s, outcome } : { state: s };
		}
		case "tabs":
			return reduceTabs(s, current, key);
		case "accordion":
			return reduceAccordion(s, current, n, key);
		case "choice":
			return current.multiple ? reduceMulti(s, current, key) : reduceChoice(s, current, key);
		case "toggle":
			if (PRESS.has(key)) s.values[current.state] = s.values[current.state] !== true;
			return { state: s };
		case "slider":
			return reduceSlider(s, current, key);
		case "text":
			return reduceText(s, current, key);
		case "cell":
			return reduceCell(s, current, key);
	}
}

function reduceTabs(s: ViewState, c: Extract<Control, { kind: "tabs" }>, key: Key): { state: ViewState } {
	const sel = s.selected[c.id] ?? 0;
	const delta = key === "right" ? 1 : key === "left" ? c.count - 1 : 0;
	s.selected[c.id] = (sel + delta) % c.count;
	return { state: s };
}

function reduceAccordion(s: ViewState, c: Extract<Control, { kind: "accordion" }>, n: number, key: Key): { state: ViewState } {
	const open = s.selected[c.id] ?? -1;
	if (PRESS.has(key)) s.selected[c.id] = open >= 0 ? -1 : 0;
	if (key !== "down" && key !== "up") return { state: s };
	const next = key === "down" ? open + 1 : open - 1;
	if (next < 0 || next >= c.count) return { state: { ...s, focus: (s.focus + (key === "down" ? 1 : n - 1)) % n } };
	s.selected[c.id] = next;
	return { state: s };
}

function reduceSlider(s: ViewState, c: Extract<Control, { kind: "slider" }>, key: Key): { state: ViewState } {
	const v = Number(s.values[c.state] ?? c.min);
	if (key === "right" || key === "up") s.values[c.state] = Math.min(c.max, v + c.step);
	if (key === "left" || key === "down") s.values[c.state] = Math.max(c.min, v - c.step);
	return { state: s };
}

function reduceText(s: ViewState, c: Extract<Control, { kind: "text" }>, key: Key): { state: ViewState } {
	if (key === "enter") return { state: { ...s, editing: c.id } };
	if (typeof key !== "object") return { state: s };
	return { state: { ...s, editing: c.id, values: { ...s.values, [c.state]: String(s.values[c.state] ?? "") + key.char } } };
}

function reduceMulti(s: ViewState, c: Extract<Control, { kind: "choice" }>, key: Key): { state: ViewState } {
	const values = c.options.map((o) => o.value);
	const cur = s.values[c.state];
	const list = Array.isArray(cur) ? [...(cur as string[])] : [];
	const idx = s.selected[c.id] ?? 0;
	if (key === "down" || key === "right") s.selected[c.id] = Math.min(values.length - 1, idx + 1);
	if (key === "up" || key === "left") s.selected[c.id] = Math.max(0, idx - 1);
	const v = values[idx];
	if (PRESS.has(key) && v !== undefined) s.values[c.state] = list.includes(v) ? list.filter((x) => x !== v) : [...list, v];
	return { state: s };
}

function reduceEditing(s: ViewState, controls: Control[], key: Key): { state: ViewState } {
	const n = controls.length;
	const c = controls.find((x) => x.id === s.editing);
	if (!c) return { state: { ...s, editing: undefined } };
	if (key === "enter" || key === "escape" || key === "tab")
		return { state: { ...s, editing: undefined, focus: key === "tab" && n ? (s.focus + 1) % n : s.focus } };
	const write = (fn: (v: string) => string) => {
		if (c.kind === "text") s.values[c.state] = fn(String(s.values[c.state] ?? ""));
		else if (c.kind === "cell") {
			const rows = (s.tables[c.table] ?? []).map((r) => [...r]);
			const row = rows[c.row] ?? [];
			row[c.col] = fn(String(row[c.col] ?? ""));
			rows[c.row] = row;
			s.tables[c.table] = rows;
		}
	};
	if (key === "backspace") write((v) => v.slice(0, -1));
	else if (typeof key === "object") write((v) => v + key.char);
	else if (key === "space") write((v) => `${v} `);
	return { state: s };
}

function reduceChoice(s: ViewState, c: Extract<Control, { kind: "choice" }>, key: Key): { state: ViewState } {
	const values = c.options.map((o) => o.value);
	const cur = s.values[c.state];
	const i = Math.max(0, values.indexOf(String(cur)));
	if (key === "down" || key === "right") s.values[c.state] = values[Math.min(values.length - 1, i + (cur == null ? 0 : 1))];
	if (key === "up" || key === "left") s.values[c.state] = values[Math.max(0, i - 1)];
	if (PRESS.has(key) && cur == null) s.values[c.state] = values[0];
	return { state: s };
}

function reduceCell(s: ViewState, current: Extract<Control, { kind: "cell" }>, key: Key): { state: ViewState } {
	if (current.options && (key === "left" || key === "right")) {
		const rows = (s.tables[current.table] ?? []).map((r) => [...r]);
		const row = rows[current.row] ?? [];
		const values = current.options.map((o) => o.value);
		const i = Math.max(0, values.indexOf(String(row[current.col])));
		row[current.col] = values[(i + (key === "right" ? 1 : values.length - 1)) % values.length];
		rows[current.row] = row;
		s.tables[current.table] = rows;
		return { state: s };
	}
	if (key === "enter" && !current.options) return { state: { ...s, editing: current.id } };
	return { state: s };
}

/** Answer payload: the evaluated @Answer value plus edited tables, never the internal UI state. */
export function answerPayload(outcome: Outcome, state: ViewState): unknown {
	if (outcome.kind !== "answer") return undefined;
	const tables = Object.keys(state.tables).length ? state.tables : undefined;
	return tables && (outcome.value === null || typeof outcome.value !== "object" || Array.isArray(outcome.value))
		? { value: outcome.value, tables }
		: tables
			? { ...(outcome.value as Record<string, unknown>), tables }
			: outcome.value;
}

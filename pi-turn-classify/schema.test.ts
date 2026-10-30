import { describe, expect, test } from "bun:test";

import {
	ACTIVITY,
	ARTIFACT,
	NEEDS,
	SCOPE,
	UNCLEAR,
	buildQuestions,
	isUnclassified,
	renderLine,
	toDecisionsQuestions,
	toSystemOneQuestions,
} from "./schema";
import type { TurnCard } from "./schema";

const projects = [{ id: "pi-agent-extensions", hint: "/home/x/byteowlz/pi-agent-extensions" }, { id: "eavs" }];

describe("schema shape", () => {
	test("builds one project question plus the six fixed questions", () => {
		const questions = buildQuestions(projects);
		expect(questions.map((question) => question.id)).toEqual([
			"project",
			"project_mismatch",
			"activity",
			"work_done",
			"blocked",
			"artifact",
			"scope",
		]);
	});

	test("drops the project question when no candidates are known", () => {
		const ids = buildQuestions([]).map((question) => question.id);
		expect(ids).not.toContain("project");
		// project_mismatch stays: it is still answerable without candidates.
		expect(ids).toContain("project_mismatch");
	});

	test("every question has a closed answer set", () => {
		for (const question of buildQuestions(projects)) {
			if (question.kind === "boolean") continue;
			const options = question.options ?? question.levels ?? [];
			expect(options.length).toBeGreaterThanOrEqual(2);
			// ids must be unique and slug-like: they are persisted
			const ids = options.map((option) => option.id);
			expect(new Set(ids).size).toBe(ids.length);
			// Fixed options are strict slugs; project ids are real project names.
			const pattern = question.id === "project" ? /^[a-z0-9][a-z0-9._-]*$/ : /^[a-z0-9_]+$/;
			for (const id of ids) expect(id).toMatch(pattern);
		}
	});

	test("respects System One limits (26 options, 2-10 score levels)", () => {
		for (const question of buildQuestions(projects)) {
			if (question.kind === "choice") expect((question.options ?? []).length).toBeLessThanOrEqual(26);
			if (question.kind === "score") {
				const levels = question.levels ?? [];
				expect(levels.length).toBeGreaterThanOrEqual(2);
				expect(levels.length).toBeLessThanOrEqual(10);
			}
		}
	});

	test("caps a huge project list at 24 candidates plus other/unclear", () => {
		const many = Array.from({ length: 60 }, (_, index) => ({ id: `p${index}` }));
		const project = buildQuestions(many).find((question) => question.id === "project");
		expect(project?.options).toHaveLength(26);
		const ids = (project?.options ?? []).map((option) => option.id);
		expect(ids).toContain("other");
		expect(ids).toContain(UNCLEAR);
	});

	test("question ids are stable across builds (persisted contract)", () => {
		const a = buildQuestions(projects)
			.map((question) => question.id)
			.join(",");
		const b = buildQuestions([{ id: "other-project" }])
			.map((question) => question.id)
			.join(",");
		expect(a).toBe(b);
		// option ids for fixed questions never move
		expect(ACTIVITY.map((option) => option.id)).toEqual([
			"implement",
			"debug",
			"test",
			"review",
			"research",
			"plan",
			"refactor",
			"ops",
			"docs",
			"setup",
			"chat",
		]);
		// actions, not analyst categories: what the user has to *do*
		expect(NEEDS.map((option) => option.id)).toEqual(["none", "decide", "approve", "answer", "fix_config", "unblock", "review"]);
		expect(ARTIFACT.map((option) => option.id)).toEqual(["code", "test", "doc", "config", "issue", "data", "none"]);
		expect(SCOPE.map((option) => option.id)).toEqual(["single", "multi", "noncode"]);
	});
});

describe("rendering to each API", () => {
	test("System One maps boolean to noul and score to ordered level names", () => {
		const rendered = toSystemOneQuestions(buildQuestions(projects));
		expect(rendered.project.type).toBe("choice");
		expect(rendered.project.criteria).toEqual({
			"pi-agent-extensions": "/home/x/byteowlz/pi-agent-extensions",
			eavs: null,
			other: "a project not in this list",
			unclear: "cannot tell from the turn",
		});
		expect(rendered.project_mismatch.type).toBe("noul");
		// Both sides always carry text: some servers reject a null criteria.
		expect(rendered.project_mismatch.criteria).toEqual({
			true: "the work belongs to a different project than the cwd",
			false: "the work belongs to the project of the cwd",
		});
		// no score question is left in the schema: risk was removed after measuring
		// 25%/37.5% accuracy, and nothing else is ordinal
		expect(Object.values(rendered).some((question) => question.type === "score")).toBe(false);
	});

	test("System One can omit instructions (D3 rejects them)", () => {
		const rendered = toSystemOneQuestions(buildQuestions(projects), { includeInstructions: false });
		for (const question of Object.values(rendered)) expect("instructions" in question).toBe(false);
	});

	test("Decisions API maps to predicate/choice/score with names", () => {
		const rendered = toDecisionsQuestions(buildQuestions(projects));
		const byName = new Map(rendered.map((question) => [question.name, question]));
		expect(byName.get("project")?.type).toBe("choice");
		expect(byName.get("project")?.choices?.map((choice) => choice.value)).toContain("eavs");
		expect(byName.get("project_mismatch")?.type).toBe("predicate");
		expect(byName.has("risk")).toBe(false);
		// every question is named: answers are matched back by name
		for (const question of rendered) expect(question.name).toBeTruthy();
	});
});

describe("the rendered line", () => {
	const questions = buildQuestions(projects);

	function card(answers: TurnCard["answers"]): TurnCard {
		return {
			version: 1,
			at: "2026-10-28T00:00:00.000Z",
			sessionId: "s",
			cwd: "/home/x/byteowlz/pi-agent-extensions",
			turn: 1,
			source: { api: "systemone", model: "vllm-sr/d3-lite", endpoint: "http://x", ms: 900 },
			answers,
			line: "",
		};
	}

	test("composes project · activity · outcome · artifact · action", () => {
		const line = renderLine(
			{
				project: { value: "pi-agent-extensions" },
				activity: { value: "implement" },
				work_done: { value: "no" },
				artifact: { value: "code" },
			},
			questions
		);
		// work_done: no -> unfinished, and no action is derived for an unfinished-but-unblocked turn
		expect(line).toBe("pi-agent-extensions · implement · unfinished · code");
	});

	test("marks a project mismatch and hides no-signal values", () => {
		const line = renderLine(
			{
				project: { value: "eavs" },
				project_mismatch: { value: "yes" },
				activity: { value: "debug" },
				work_done: { value: "yes" },
				artifact: { value: "none" },
				needs: { value: "none" },
			},
			questions
		);
		expect(line).toBe("eavs (cwd differs) · debug · done · needs: review");
		expect(line).not.toContain("none");
	});

	test("unclear answers are silent and an empty card is recognisable", () => {
		const empty = renderLine({ activity: { value: UNCLEAR }, project: { value: UNCLEAR } }, questions);
		expect(empty).toBe("");
		expect(isUnclassified(card({ activity: { value: UNCLEAR } }))).toBe(true);
	});

	test("unknown answer ids still render (forward compatibility)", () => {
		expect(renderLine({ activity: { value: "deploy_things" } }, questions)).toBe("deploy_things");
	});
});

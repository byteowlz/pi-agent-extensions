import { describe, expect, test } from "bun:test";

import {
	ACTIVITY,
	ARTIFACT,
	ATTENTION,
	RISK,
	SCOPE,
	STATUS,
	UNCLEAR,
	buildQuestions,
	isUnclassified,
	renderLine,
	scoreLevelId,
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
			"status",
			"attention",
			"risk",
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
		expect(STATUS.map((option) => option.id)).toEqual(["exploring", "implementing", "verifying", "blocked", "done"]);
		expect(ATTENTION.map((option) => option.id)).toEqual(["none", "decision", "approval", "missing_info", "review"]);
		expect(RISK.map((option) => option.id)).toEqual(["none", "low", "medium", "high", "critical"]);
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
		expect(rendered.risk.type).toBe("score");
		expect(rendered.risk.criteria).toEqual(["none", "low", "medium", "high", "critical"]);
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
		expect(byName.get("risk")?.type).toBe("score");
		expect(byName.get("risk")?.levels?.map((level) => level.label)).toEqual(["none", "low", "medium", "high", "critical"]);
		// every question is named: answers are matched back by name
		for (const question of rendered) expect(question.name).toBeTruthy();
	});
});

describe("score to level", () => {
	const risk = buildQuestions([]).find((question) => question.id === "risk");

	test("rounds to the nearest level and clamps", () => {
		expect(scoreLevelId(risk!, 0)).toBe("none");
		expect(scoreLevelId(risk!, 0.4)).toBe("none");
		expect(scoreLevelId(risk!, 0.6)).toBe("low");
		expect(scoreLevelId(risk!, 2.2)).toBe("medium");
		expect(scoreLevelId(risk!, 4)).toBe("critical");
		expect(scoreLevelId(risk!, 9)).toBe("critical");
		expect(scoreLevelId(risk!, -3)).toBe("none");
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

	test("composes project · activity · status · artifact · attention", () => {
		const line = renderLine(
			{
				project: { value: "pi-agent-extensions" },
				activity: { value: "implement" },
				status: { value: "implementing" },
				artifact: { value: "code" },
				attention: { value: "review" },
			},
			questions
		);
		expect(line).toBe("pi-agent-extensions · implement · implementing · code · needs review");
	});

	test("marks a project mismatch and hides no-signal values", () => {
		const line = renderLine(
			{
				project: { value: "eavs" },
				project_mismatch: { value: "yes" },
				activity: { value: "debug" },
				status: { value: "done" },
				artifact: { value: "none" },
				attention: { value: "none" },
			},
			questions
		);
		expect(line).toBe("eavs (cwd differs) · debug · done");
		expect(line).not.toContain("none");
	});

	test("escalates risk only when it matters", () => {
		const low = renderLine({ activity: { value: "implement" }, risk: { value: "low" } }, questions);
		expect(low).toBe("implement");
		const high = renderLine({ activity: { value: "ops" }, risk: { value: "high" } }, questions);
		expect(high).toBe("ops · risk high");
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

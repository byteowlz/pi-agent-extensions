import { expect, test } from "bun:test";
import { subagentTaskPrompt } from "./subagent-prompt.js";

test("delegated tasks open with a short subagent identity notice", () => {
	const prompt = subagentTaskPrompt("Review the tests", { label: "[sub] Review Tests [abc123]" });
	const [notice, ...rest] = prompt.split("\n\n");
	expect(notice).toStartWith("Subagent notice: you are a subagent");
	expect(notice).toContain("[sub] Review Tests [abc123]");
	expect(notice).toContain("parent pi session");
	expect(notice.length).toBeLessThan(300);
	expect(rest.join("\n\n")).toBe("Review the tests");
});

test("the notice stays valid without a known label and keeps multi-line tasks intact", () => {
	const task = "Step 1\nStep 2\n\nStep 3";
	const prompt = subagentTaskPrompt(task, {});
	expect(prompt).toStartWith("Subagent notice: you are a subagent,");
	expect(prompt.endsWith(task)).toBe(true);
	expect(prompt.split(task).length).toBe(2);
});

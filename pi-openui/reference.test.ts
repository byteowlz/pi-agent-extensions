import { expect, test } from "bun:test";
import { OPENUI_GUIDANCE, PROGRAM_REFERENCE, buildProgramReference } from "./reference.js";

test("profile boundaries must be reviewed if the bundled document changes", () => {
	for (const profile of ["unrecognized profile", "## Syntax Rules\nreference without an end marker"])
		expect(() => buildProgramReference(profile)).toThrow("boundaries changed");
});

test("only the language reference is exposed, not the profile's global assistant policy", () => {
	const reference = buildProgramReference("Global policy\n## Syntax Rules\nSyntax\n## Important Rules\nGlobal instructions");
	expect(reference).toContain("Syntax");
	expect(reference).not.toContain("Global");
	expect(OPENUI_GUIDANCE.length).toBeLessThan(1200);
	expect(PROGRAM_REFERENCE).toContain("## Examples");
});

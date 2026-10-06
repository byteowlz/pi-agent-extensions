import { expect, test } from "bun:test";
import { parseInterval } from "./index.js";

test("natural recurrence aliases are explicit elapsed durations", () => {
	for (const [input, ms] of [
		["minutely", 60000],
		["hourly", 3600000],
		["daily", 86400000],
		["weekly", 604800000],
		[" WEEKLY ", 604800000],
	] as const)
		expect(parseInterval(input)).toBe(ms);
});
test("unsupported formats and bounds include actionable accepted examples", () => {
	for (const input of ["monthly", "P7D", "every Monday", "30s", "366d", "1 parsecs"])
		expect(() => parseInterval(input)).toThrow(/Use.*30m.*2h.*7d/);
});

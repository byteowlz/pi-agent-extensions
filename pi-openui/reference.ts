import { SYSTEM_PROMPT } from "./openui-vendor.js";

/** Use only the profile's language reference, never its global assistant policy. */
export function buildProgramReference(profile: string): string {
	const start = profile.indexOf("## Syntax Rules");
	const end = profile.indexOf("\n## Important Rules", start);
	if (start < 0 || end <= start) throw new Error("OpenUI profile reference boundaries changed; review the profile before use");
	return `# OpenUI program reference\n\nThis reference applies only to the openui tool's program argument. Examples are illustrative, not factual user data.\n\n${profile.slice(start, end).trim()}`;
}

export const PROGRAM_REFERENCE = buildProgramReference(SYSTEM_PROMPT);
export const OPENUI_GUIDANCE =
	"Put OpenUI Lang only in the openui tool's program argument, not normal chat. " +
	"Use openui_reference for syntax and component details as needed. These rules do not govern other responses. " +
	"Always include a short plain-text fallback. Set wait: true when @Answer controls request the user's answer; " +
	"the tool result contains that answer. Other actions are reported as events, not executed or treated as approval.";

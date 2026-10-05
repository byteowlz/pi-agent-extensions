import { Type } from "typebox";

export const SUDO_OUTPUT_CHARS = 32000;
export const sudoOutputSchema = Type.Object({
	ok: Type.Boolean(),
	scope: Type.String({ enum: ["local", "remote"] }),
	host: Type.Optional(Type.String()),
	exitCode: Type.Integer(),
	stdout: Type.String({ maxLength: SUDO_OUTPUT_CHARS }),
	stderr: Type.String({ maxLength: SUDO_OUTPUT_CHARS }),
	cancelled: Type.Boolean(),
	timedOut: Type.Boolean(),
	truncated: Type.Boolean(),
	omittedStdoutChars: Type.Integer({ minimum: 0 }),
	omittedStderrChars: Type.Integer({ minimum: 0 }),
	error: Type.Optional(Type.Object({ code: Type.String(), message: Type.String({ maxLength: 1600 }) })),
	// A failed/cancelled privileged invocation may already have had effects.
	effects: Type.String({ enum: ["none", "possible"] }),
});

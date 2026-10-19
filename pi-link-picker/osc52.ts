/**
 * OSC 52 clipboard writes. Works remotely through SSH, Herdr and tmux without a
 * local clipboard binary. Never touches the filesystem.
 */

export interface Osc52Options {
	/** Wrap in tmux DCS passthrough (required when tmux is the outer multiplexer). */
	tmux?: boolean;
	/** Selectable clipboard target. Defaults to "c" (system clipboard). */
	selection?: string;
}

/** Base64 encode UTF-8 without Node's Buffer so this stays dependency-free. */
export function base64Utf8(text: string): string {
	const bytes = new TextEncoder().encode(text);
	let binary = "";
	for (const byte of bytes) binary += String.fromCharCode(byte);
	// btoa is available in Bun and browsers; Buffer is not guaranteed in every host.
	const encoded = typeof btoa === "function" ? btoa(binary) : Buffer.from(bytes).toString("base64");
	return encoded.replace(/=+$/, "");
}

export const OSC52_MAX_BASE64 = 100_000;

/** Build the OSC 52 escape sequence, optionally wrapped for tmux passthrough. */
export function osc52Sequence(text: string, options: Osc52Options = {}): string {
	const payload = base64Utf8(text);
	const selection = options.selection ?? "c";
	const sequence = `\u001b]52;${selection};${payload}\u0007`;
	if (!options.tmux) return sequence;
	// tmux passes the inner escape through only when every ESC is doubled.
	return `\u001bPtmux;\u001b${sequence.replaceAll("\u001b", "\u001b\u001b")}\u001b\\`;
}

export interface Osc52Result {
	ok: boolean;
	bytes: number;
	error?: string;
}

/** Emit a clipboard write. Oversized payloads fail closed rather than truncate. */
export function emitOsc52(
	text: string,
	env: NodeJS.ProcessEnv = process.env,
	write: (chunk: string) => unknown = (chunk) => process.stdout.write(chunk)
): Osc52Result {
	if (!text) return { ok: false, bytes: 0, error: "Nothing to copy" };
	const payload = base64Utf8(text);
	if (payload.length > OSC52_MAX_BASE64)
		return { ok: false, bytes: payload.length, error: `Value is too large for OSC 52 (${payload.length} bytes)` };
	const tmux = Boolean(env.TMUX) && !env.HERDR_ENV;
	write(osc52Sequence(text, { tmux }));
	return { ok: true, bytes: payload.length };
}

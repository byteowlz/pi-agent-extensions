import { expect, test } from "bun:test";
import { OSC52_MAX_BASE64, base64Utf8, emitOsc52, osc52Sequence } from "./osc52.js";

test("base64Utf8 encodes UTF-8 and omits padding", () => {
	expect(base64Utf8("https://pi.dev")).toBe("aHR0cHM6Ly9waS5kZXY");
	expect(base64Utf8("héllo")).toBe(Buffer.from("héllo", "utf8").toString("base64").replace(/=+$/, ""));
	expect(base64Utf8("")).toBe("");
});

test("sequence uses the system clipboard and doubles ESC for tmux passthrough", () => {
	expect(osc52Sequence("hi")).toBe("\u001b]52;c;aGk=\u0007".replace("aGk=", "aGk"));
	const wrapped = osc52Sequence("hi", { tmux: true });
	expect(wrapped.startsWith("\u001bPtmux;\u001b")).toBe(true);
	expect(wrapped.endsWith("\u001b\\")).toBe(true);
	expect(wrapped).toContain("]52;c;");
	// Every inner ESC (but the DCS opener) is doubled.
	expect(wrapped.slice("\u001bPtmux;\u001b".length).startsWith("\u001b\u001b]52;c;")).toBe(true);
});

test("emitOsc52 writes a copy sequence and reports bytes", () => {
	const writes: string[] = [];
	const result = emitOsc52("https://pi.dev", {}, (chunk) => writes.push(chunk));
	expect(result.ok).toBe(true);
	expect(writes.join("")).toContain("]52;c;");
	// No tmux wrapper when only Herdr is present.
	expect(writes.join("")).not.toContain("tmux;");
});

test("emitOsc52 uses tmux passthrough when tmux is the outer multiplexer", () => {
	const writes: string[] = [];
	emitOsc52("x", { TMUX: "/tmp/tmux,1,0" }, (chunk) => writes.push(chunk));
	expect(writes.join("")).toContain("\u001bPtmux;");
	// Inside Herdr, tmux is never assumed even if TMUX leaked in.
	const herdr: string[] = [];
	emitOsc52("x", { TMUX: "/tmp/tmux,1,0", HERDR_ENV: "1" }, (chunk) => herdr.push(chunk));
	expect(herdr.join("")).not.toContain("tmux;");
});

test("emitOsc52 fails closed on empty and oversized payloads", () => {
	expect(emitOsc52("", {}, () => undefined).ok).toBe(false);
	const huge = "a".repeat(OSC52_MAX_BASE64 + 10);
	const result = emitOsc52(huge, {}, () => undefined);
	expect(result.ok).toBe(false);
	expect(result.error).toContain("too large");
});

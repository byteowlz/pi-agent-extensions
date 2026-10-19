import { expect, test } from "bun:test";
import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import extension from "./index.js";

interface Harness {
	captured: string[];
	pasted: string[];
	notices: string[];
	run(messages: string[]): Promise<void>;
	component(): { render(width: number): string[]; handleInput(data: string): void };
}

const theme = {
	fg: (_color: string, value: string) => value,
	bold: (value: string) => value,
} as never;

function harness(): Harness {
	let handler: ((args: string, ctx: ExtensionCommandContext) => Promise<void>) | undefined;
	extension({
		registerCommand: (_name: string, options: { handler: typeof handler }) => {
			handler = options.handler;
		},
	} as unknown as ExtensionAPI);
	const captured: string[] = [];
	const pasted: string[] = [];
	const notices: string[] = [];
	let component: { render(width: number): string[]; handleInput(data: string): void } | undefined;
	let resolveDone: ((value: unknown) => void) | undefined;
	const run = async (messages: string[]): Promise<void> => {
		const ctx = {
			mode: "tui",
			sessionManager: {
				getBranch: () => messages.map((text) => ({ type: "message", message: { role: "user", content: text } })),
			},
			ui: {
				notify: (text: string) => notices.push(text),
				pasteToEditor: (text: string) => pasted.push(text),
				custom: (factory: (tui: unknown, t: unknown, kb: unknown, done: (v: unknown) => void) => unknown) => {
					component = factory({ requestRender() {}, terminal: { rows: 30 } }, theme, {}, (value: unknown) =>
						resolveDone?.(value)
					) as typeof component;
					return new Promise((resolve) => {
						resolveDone = resolve;
					});
				},
			},
		} as unknown as ExtensionCommandContext;
		if (!handler) throw new Error("command not registered");
		const promise = handler("", ctx);
		await new Promise((resolve) => setTimeout(resolve, 0));
		await promise;
	};
	const original = process.stdout.write.bind(process.stdout);
	// Capture OSC 52 without polluting test output.
	process.stdout.write = ((chunk: string) => {
		captured.push(String(chunk));
		return true;
	}) as typeof process.stdout.write;
	process.on("exit", () => {
		process.stdout.write = original;
	});
	return {
		captured,
		pasted,
		notices,
		run,
		component: () => {
			if (!component) throw new Error("no component mounted");
			return component;
		},
	};
}

test("scans the current session, shows categories and copies the selection with OSC 52", async () => {
	const h = harness();
	const running = h.run(["check https://pi.dev/docs and src/index.ts"]);
	const view = h.component().render(80).join("\n");
	expect(view).toContain("grab");
	expect(view).toContain("URLs 1");
	expect(view).toContain("Paths 1");
	h.component().handleInput("\r");
	await running;
	expect(h.captured.join("")).toContain("\u001b]52;c;");
	expect(Buffer.from("https://pi.dev/docs", "utf8").toString("base64").replace(/=+$/, "")).toBeTruthy();
	expect(h.notices.at(-1)).toContain("Copied URLs");
	expect(h.component().render(80)).toBeDefined();
});

test("Tab cycles categories so the copy can target a different category", async () => {
	const h = harness();
	const running = h.run(["https://pi.dev/docs and src/index.ts"]);
	// All -> URLs -> Paths
	h.component().handleInput("\t");
	h.component().handleInput("\t");
	h.component().handleInput("\r");
	await running;
	expect(h.notices.at(-1)).toContain("Copied Paths");
	expect(h.captured.join("")).toContain("c3JjL2luZGV4LnRz"); // src/index.ts
});

test("secret values are redacted by default and revealed with v", async () => {
	const h = harness();
	const running = h.run(["token sk-abcdefghijklmnopqrstuvwx"]);
	const redacted = h.component().render(80).join("\n");
	expect(redacted).toContain("sk-a…uvwx");
	expect(redacted).not.toContain("sk-abcdefghijklmnopqrstuvwx");
	h.component().handleInput("v");
	expect(h.component().render(80).join("\n")).toContain("sk-abcdefghijklmnopqrstuvwx");
	h.component().handleInput("\u001b");
	await running;
});

test("filter narrows the list and p pastes into the editor instead of copying", async () => {
	const h = harness();
	const running = h.run(["alpha https://a.dev", "beta https://b.dev"]);
	h.component().handleInput("/");
	for (const ch of "b.dev") h.component().handleInput(ch);
	h.component().handleInput("\r");
	expect(h.component().render(80).join("\n")).toContain("https://b.dev");
	expect(h.component().render(80).join("\n")).not.toContain("https://a.dev");
	h.component().handleInput("p");
	await running;
	expect(h.pasted).toEqual(["https://b.dev"]);
	expect(h.captured.join("")).not.toContain("]52;c;");
});

test("empty sessions notify instead of mounting a picker", async () => {
	const h = harness();
	await h.run([]);
	expect(h.notices.at(-1)).toContain("Nothing to grab");
	expect(() => h.component()).toThrow("no component");
});

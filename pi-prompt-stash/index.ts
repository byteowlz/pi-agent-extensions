import { join } from "node:path";
import { type ExtensionAPI, type ExtensionContext, getAgentDir } from "@earendil-works/pi-coding-agent";
import { Key } from "@earendil-works/pi-tui";
import { type HistoryPrompt, browseHistory, userPrompts } from "./history.js";
import { type PickItem, PromptPicker } from "./picker.js";
import { type Scope, addItems, paths, readStore, removeItems, saveCommand } from "./store.js";

const SCOPES: Scope[] = ["session", "cwd", "global"];
export function commandName(name: string): string {
	const normalized = name.trim().replace(/^\//, "");
	if (!/^p-[a-z][a-z0-9-]{0,45}$/.test(normalized))
		throw new Error(
			"Use a command name such as p-laundry (lowercase, digits, hyphens). The p- namespace avoids built-in commands."
		);
	return normalized;
}
export default function promptStash(pi: ExtensionAPI) {
	let generation = 0;
	let busy = false;
	let active: AbortController | undefined;
	const registered = new Set<string>();
	function guard(token: number) {
		if (token !== generation) throw new Error("Stash interaction cancelled by session change/reload");
	}
	async function pathFor(ctx: ExtensionContext, scope: Scope) {
		return paths({ scope, cwd: ctx.cwd, agentDir: getAgentDir(), sessionFile: ctx.sessionManager.getSessionFile() });
	}
	async function scopePicker(ctx: ExtensionContext, token: number, title = "Save scope"): Promise<Scope | undefined> {
		const selected = await ctx.ui.select(title, SCOPES, { signal: active?.signal });
		guard(token);
		return SCOPES.find((s) => s === selected);
	}
	async function select<T extends PickItem>(
		ctx: ExtensionContext,
		token: number,
		title: string,
		items: T[]
	): Promise<T[] | undefined> {
		if (!items.length) {
			ctx.ui.notify("No saved/recorded prompts in this scope", "info");
			return;
		}
		if (ctx.mode !== "tui")
			throw new Error("Prompt multiselect requires Pi TUI; /pop <scope> restores the latest item without a custom picker.");
		guard(token);
		const signal = active?.signal;
		const result = await ctx.ui.custom<T[] | undefined>((tui, _theme, _kb, done) => {
			const cancel = () => done(undefined);
			signal?.addEventListener("abort", cancel, { once: true });
			return new PromptPicker(
				items,
				title,
				() => tui.requestRender(),
				(value) => {
					signal?.removeEventListener("abort", cancel);
					done(value);
				}
			);
		});
		guard(token);
		return result;
	}
	async function restore(ctx: ExtensionContext, token: number, text: string): Promise<boolean> {
		guard(token);
		const previous = ctx.ui.getEditorText();
		let replacement = text;
		if (previous) {
			const choice = await ctx.ui.select("Editor already contains a draft", ["Cancel", "Append", "Replace current draft"], {
				signal: active?.signal,
			});
			guard(token);
			if (!choice || choice === "Cancel") return false;
			if (ctx.ui.getEditorText() !== previous) throw new Error("Draft changed while choosing; nothing replaced");
			if (choice === "Append") replacement = `${previous}\n\n${text}`;
		}
		ctx.ui.setEditorText(replacement);
		if (ctx.ui.getEditorText() !== replacement)
			throw new Error("Editor restoration could not be verified; saved prompt retained");
		return true;
	}
	async function draft(ctx: ExtensionContext, token: number, scope: Scope, park: boolean) {
		guard(token);
		const text = ctx.ui.getEditorText();
		if (!text.trim()) throw new Error("Editor is empty. Use Ctrl+Alt+S while your draft is still in the editor.");
		const path = await pathFor(ctx, scope);
		guard(token);
		await addItems(path, [{ text, source: { sessionId: ctx.sessionManager.getSessionId() } }]);
		guard(token);
		if (park && ctx.ui.getEditorText() === text) ctx.ui.setEditorText("");
		ctx.ui.notify(
			`${park ? "Parked" : "Stashed copy"} (${scope}, text only)${park && ctx.ui.getEditorText() ? "; newer draft kept" : ""}`,
			"info"
		);
	}
	async function pop(ctx: ExtensionContext, token: number, scope: Scope) {
		const path = await pathFor(ctx, scope);
		const item = (await readStore(path)).entries.at(-1);
		guard(token);
		if (!item) throw new Error(`No stashed prompt in ${scope} scope`);
		if (await restore(ctx, token, item.text)) {
			try {
				await removeItems(path, [item.id]);
				guard(token);
				ctx.ui.notify("Restored draft; nothing submitted", "info");
			} catch (error) {
				guard(token);
				ctx.ui.notify(
					`Draft restored; stash retained if removal failed: ${error instanceof Error ? error.message : String(error)}`,
					"warning"
				);
			}
		}
	}
	async function available(ctx: ExtensionContext) {
		const records = [];
		for (const scope of SCOPES) {
			if (scope === "session" && !ctx.sessionManager.getSessionFile()) continue;
			const path = await pathFor(ctx, scope);
			const doc = await readStore(path);
			records.push({ scope, path, doc });
		}
		return records;
	}
	async function registerCommands(ctx: ExtensionContext) {
		const token = generation;
		for (const { doc } of await available(ctx))
			for (const cmd of doc.commands) {
				guard(token);
				commandName(cmd.name);
				if (registered.has(cmd.name)) continue;
				if (pi.getCommands().some((c) => c.name === cmd.name))
					throw new Error(`Command /${cmd.name} belongs to another extension/template; not replaced`);
				registered.add(cmd.name);
				pi.registerCommand(cmd.name, {
					description: "Restore saved prompt into editor (never submit)",
					handler: async (_args, current) =>
						run(current, async (t) => {
							const found = (await available(current)).map((r) => r.doc.commands.find((c) => c.name === cmd.name)).find(Boolean);
							guard(t);
							if (!found) throw new Error("Saved command is unavailable in this session/cwd; nothing submitted");
							await restore(current, t, found.text);
						}),
				});
			}
	}
	async function promote(ctx: ExtensionContext, token: number, items: PickItem[]) {
		const scope = await scopePicker(ctx, token, "Command availability scope");
		if (!scope) return;
		const path = await pathFor(ctx, scope);
		guard(token);
		for (const item of items) {
			const answer = await ctx.ui.input("Command name (p- namespace; fills editor, never submits)", "p-my-prompt");
			guard(token);
			if (answer === undefined) return;
			const name = commandName(answer);
			if (!registered.has(name) && pi.getCommands().some((c) => c.name === name))
				throw new Error(`/${name} already belongs to another extension/template`);
			const edited = await ctx.ui.editor(`Review /${name} — ${scope} — text only`, item.text);
			guard(token);
			if (edited === undefined) continue;
			const exists = (await readStore(path)).commands.some((c) => c.name === name);
			guard(token);
			if (exists && !(await ctx.ui.confirm("Replace saved command?", `/${name} in ${scope}`))) {
				guard(token);
				continue;
			}
			guard(token);
			await saveCommand(path, name, edited, { overwrite: exists });
			guard(token);
			await registerCommands(ctx);
			guard(token);
			ctx.ui.notify(`Saved /${name} (${scope}); reload if autocomplete hasn't refreshed`, "info");
		}
	}
	async function actions(ctx: ExtensionContext, token: number, items: PickItem[], sourcePath?: string) {
		if (items.some((item) => item.attachmentsOmitted)) {
			if (!(await ctx.ui.confirm("Text-only prompts", "Attachments are not stored or restored. Continue?"))) {
				guard(token);
				return;
			}
			guard(token);
		}
		const options = [
			"Stash selected",
			"Stash & promote",
			"Promote to commands",
			...(items.length === 1 ? ["Restore copy", ...(sourcePath ? ["Pop (restore and remove)"] : [])] : []),
			...(sourcePath ? ["Delete selected"] : []),
		];
		const action = await ctx.ui.select(`${items.length} prompt(s) selected`, options, { signal: active?.signal });
		guard(token);
		if (action === "Promote to commands") return promote(ctx, token, items);
		if (action === "Stash selected" || action === "Stash & promote") {
			const scope = await scopePicker(ctx, token);
			if (!scope) return;
			const path = await pathFor(ctx, scope);
			guard(token);
			await addItems(
				path,
				items.map((i) => ({ text: i.text, label: i.label, source: "source" in i ? (i as HistoryPrompt).source : undefined }))
			);
			guard(token);
			ctx.ui.notify(`Stashed ${items.length} prompt(s) (${scope})`, "info");
			if (action === "Stash & promote") await promote(ctx, token, items);
		} else if (action === "Restore copy" || action === "Pop (restore and remove)") {
			if ((await restore(ctx, token, items[0].text)) && action.startsWith("Pop") && sourcePath) {
				await removeItems(sourcePath, [items[0].id]);
				guard(token);
			}
		} else if (action === "Delete selected" && sourcePath) {
			if (await ctx.ui.confirm("Delete saved prompts?", `${items.length} selected; original session history stays untouched`)) {
				guard(token);
				await removeItems(
					sourcePath,
					items.map((i) => i.id)
				);
				guard(token);
			}
		}
	}
	async function saved(ctx: ExtensionContext, token: number, scope: Scope) {
		const path = await pathFor(ctx, scope);
		const items = (await readStore(path)).entries.slice().reverse();
		guard(token);
		const picked = await select(ctx, token, `Saved prompts — ${scope}`, items);
		if (picked) await actions(ctx, token, picked, path);
	}
	async function history(ctx: ExtensionContext, token: number, scope: Scope) {
		let items: HistoryPrompt[];
		if (scope === "session")
			items = userPrompts(
				ctx.sessionManager.getEntries(),
				ctx.sessionManager.getSessionId(),
				ctx.sessionManager.getSessionFile(),
				ctx.sessionManager.getSessionName() ?? "current session"
			).slice(0, 1000);
		else {
			const result = await browseHistory(
				scope === "cwd"
					? [ctx.sessionManager.getSessionDir()]
					: [join(getAgentDir(), "sessions"), ctx.sessionManager.getSessionDir()],
				scope === "cwd" ? ctx.cwd : undefined,
				active?.signal
			);
			guard(token);
			items = result.items;
			if (result.limited || result.skipped)
				ctx.ui.notify(
					`Bounded history view: ${result.limited ? "limits reached; " : ""}${result.skipped} oversized/malformed files or records skipped`,
					"warning"
				);
		}
		const picked = await select(ctx, token, `Recorded user prompts — ${scope} (all branches; text only)`, items);
		if (picked) await actions(ctx, token, picked);
	}
	async function menu(ctx: ExtensionContext, token: number, scope?: Scope) {
		const action = await ctx.ui.select(
			"Prompt stash — text only",
			["Park current draft", "Stash draft copy", "Saved prompts", "User prompt history"],
			{ signal: active?.signal }
		);
		guard(token);
		if (action === "Park current draft" || action === "Stash draft copy") {
			const chosen = scope ?? (await scopePicker(ctx, token));
			if (chosen) await draft(ctx, token, chosen, action.startsWith("Park"));
		} else if (action === "Saved prompts" || action === "User prompt history") {
			const chosen = scope ?? (await scopePicker(ctx, token, "Browse scope"));
			if (chosen) {
				if (action === "Saved prompts") await saved(ctx, token, chosen);
				else await history(ctx, token, chosen);
			}
		} else if (action === undefined) return;
		else await saved(ctx, token, scope ?? "session");
	}
	async function run(ctx: ExtensionContext, operation: (token: number) => Promise<void>) {
		if (!ctx.hasUI) return;
		if (busy) {
			ctx.ui.notify("Stash interaction already open", "warning");
			return;
		}
		busy = true;
		active = new AbortController();
		const token = generation;
		try {
			await operation(token);
		} catch (error) {
			if (token === generation) ctx.ui.notify(error instanceof Error ? error.message : String(error), "error");
		} finally {
			busy = false;
		}
	}
	pi.registerCommand("stash", {
		description: "Prompt stash: [session|cwd|global], list, history, or copy; Ctrl+Alt+S parks a live draft",
		handler: async (args, ctx) =>
			run(ctx, async (token) => {
				const [verb, ...rest] = args.trim().split(/\s+/);
				const scope = SCOPES.find((s) => s === rest[0] || s === verb) ?? "session";
				if (verb === "history") await history(ctx, token, scope);
				else if (verb === "list") await saved(ctx, token, scope);
				else if (verb === "copy") await draft(ctx, token, scope, false);
				else await menu(ctx, token, args.trim() ? scope : undefined);
			}),
	});
	pi.registerCommand("park", {
		description: "Park editor text: [session|cwd|global] (prefer Ctrl+Alt+S for a live draft)",
		handler: async (args, ctx) => run(ctx, (t) => draft(ctx, t, SCOPES.find((s) => s === args.trim()) ?? "session", true)),
	});
	pi.registerCommand("pop", {
		description: "Restore latest stashed prompt: [session|cwd|global]; never submits",
		handler: async (args, ctx) => run(ctx, (t) => pop(ctx, t, SCOPES.find((s) => s === args.trim()) ?? "session")),
	});
	pi.registerShortcut(Key.ctrlAlt("s"), {
		description: "Park/stash draft, recover user history, promote commands",
		handler: async (ctx) => run(ctx, (t) => menu(ctx, t)),
	});
	pi.on("session_start", async (_event, ctx) => {
		generation++;
		active?.abort();
		try {
			await registerCommands(ctx);
		} catch (error) {
			ctx.ui.notify(`Prompt stash: ${error instanceof Error ? error.message : String(error)}`, "warning");
		}
	});
	pi.on("session_before_switch", () => {
		generation++;
		active?.abort();
	});
	pi.on("session_shutdown", () => {
		generation++;
		active?.abort();
	});
}

/**
 * pi-nym: redact the current session with nym before it goes to a cloud model.
 *
 * /nym scans a snapshot of the session locally, lets the user choose what to
 * redact, writes the redacted copy as a new session and switches to it. The
 * original can be kept, deleted, or stored as an encrypted backup (gpg +
 * kyz). /nym-restore brings a backed-up original back.
 */

import { copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import type { ExtensionAPI, ExtensionCommandContext, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { type Bundle, FORMAT, decrypt, ensureSecret, listBackups, parseBundle, writeBackup } from "./backup.js";
import { type BackupMode, type PiNymConfig, backupDir, loadConfig } from "./config.js";
import { type Candidate, type ProgressEvent, apply, findNym, findOnPath, fraction, isCapable, plan } from "./nym.js";
import { type Decision, RedactionPicker, type Styler, groupLabel, printable } from "./picker.js";
import { buildSession, hasUnredactedContent, residuals, sessionFileName, uuidv7 } from "./session.js";

const BACKUP_CHOICES: Record<BackupMode, string> = {
	encrypted: "Encrypted backup of the original (gpg + kyz), then remove the plaintext original",
	keep: "Keep the original session file unencrypted",
	delete: "Remove the original without a backup (irreversible)",
};

function backupOrder(preferred: BackupMode): BackupMode[] {
	return [preferred, ...(["encrypted", "keep", "delete"] as BackupMode[]).filter((m) => m !== preferred)];
}

function secretOf(config: PiNymConfig) {
	return { service: config.kyzService, key: config.kyzKey };
}

export function isLocalModel(provider: string | undefined, config: PiNymConfig): boolean {
	return !!provider && config.localProviders.map((p) => p.toLowerCase()).includes(provider.toLowerCase());
}

async function choose(ctx: ExtensionCommandContext, candidates: Candidate[]): Promise<Decision | undefined> {
	return ctx.ui.custom<Decision | undefined>((tui, theme, _kb, done) => {
		const style: Styler = {
			accent: (t) => theme.fg("accent", t),
			dim: (t) => theme.fg("dim", t),
			warn: (t) => theme.fg("warning", t),
			mark: (t) => theme.inverse(t),
		};
		return new RedactionPicker(candidates, () => tui.requestRender(), done, style);
	});
}

async function chooseBackup(ctx: ExtensionCommandContext, config: PiNymConfig): Promise<BackupMode | undefined> {
	const order = backupOrder(config.defaultBackup);
	const picked = await ctx.ui.select(
		"Original session",
		order.map((m) => BACKUP_CHOICES[m])
	);
	return order.find((m) => BACKUP_CHOICES[m] === picked);
}

async function confirmResiduals(ctx: ExtensionCommandContext, redacted: string, decision: Decision): Promise<boolean> {
	const left = residuals(
		redacted,
		decision.redact,
		decision.keep.map((c) => c.value)
	);
	if (!left.length) return true;
	const shown = left
		.slice(0, 6)
		.map((r) => `  "${printable(r.value)}" (${r.class}) ×${r.remaining}`)
		.join("\n");
	return ctx.ui.confirm(
		"Some selected values still appear",
		`nym replaces names, accounts and secrets everywhere, but short numbers, dates and URLs only where it detected them:\n${shown}${left.length > 6 ? `\n  … ${left.length - 6} more` : ""}\n\nContinue with this redaction?`
	);
}

const PHASES: Record<ProgressEvent["phase"], string> = {
	detect: "patterns",
	ner: "names (NER)",
	replace: "replacing",
	done: "done",
};

/** Text progress bar, e.g. `[██████░░░░░░] 52%`. */
export function bar(value: number, width = 24): string {
	const clamped = Math.max(0, Math.min(1, value));
	const filled = Math.round(clamped * width);
	return `[${"█".repeat(filled)}${"░".repeat(width - filled)}] ${Math.round(clamped * 100)}%`;
}

/** A widget above the editor showing one nym pass. */
function progressWidget(ctx: ExtensionCommandContext, title: string) {
	const started = Date.now();
	let shown = 0;
	const draw = (event?: ProgressEvent) => {
		// Never move backwards, even if a phase reports an empty total first.
		shown = Math.max(shown, event ? fraction(event) : 0);
		const seconds = Math.round((Date.now() - started) / 1000);
		const detail = event ? `${PHASES[event.phase]} • ${seconds}s` : "starting";
		ctx.ui.setWidget("pi-nym", [`nym: ${title} ${bar(shown)}  ${detail}`]);
	};
	draw();
	return { onProgress: draw, clear: () => ctx.ui.setWidget("pi-nym", undefined) };
}

interface Prepared {
	original: string;
	newPath: string;
	backupPath?: string;
	mode: BackupMode;
	decision: Decision;
}

function bundleFor(ctx: ExtensionCommandContext, original: string, sessionText: string, keys: string, newPath: string): Bundle {
	return {
		format: FORMAT,
		createdAt: new Date().toISOString(),
		sessionId: ctx.sessionManager.getSessionId(),
		sessionName: ctx.sessionManager.getSessionName(),
		cwd: ctx.sessionManager.getCwd(),
		originalPath: original,
		redactedPath: newPath,
		session: sessionText,
		keys,
	};
}

async function prepare(ctx: ExtensionCommandContext, config: PiNymConfig, work: string): Promise<Prepared | undefined> {
	const original = ctx.sessionManager.getSessionFile();
	if (!original || !existsSync(original)) throw new Error("this session is not saved to a file yet");
	const binary = await findNym(config);
	const snapshot = join(work, basename(original));
	copyFileSync(original, snapshot);
	const paths = { work, snapshot };
	const scanning = progressWidget(ctx, "scanning session (1/2)");
	const candidates = await plan(binary, paths, config, ctx.signal, undefined, scanning.onProgress).finally(scanning.clear);
	if (!candidates.length) {
		ctx.ui.notify("nym found nothing to redact in this session.", "info");
		return undefined;
	}
	const decision = await choose(ctx, candidates);
	if (!decision?.redact.length) {
		if (decision) ctx.ui.notify("Nothing selected; the session is unchanged.", "info");
		return undefined;
	}
	const mode = await chooseBackup(ctx, config);
	if (!mode) return undefined;
	if (mode === "encrypted") await ensureSecret(secretOf(config));
	if (
		mode === "delete" &&
		!(await ctx.ui.confirm("Remove the original?", "The unredacted session will be deleted with no backup."))
	) {
		return undefined;
	}
	const redacting = progressWidget(ctx, "redacting (2/2)");
	const applied = await apply(binary, paths, decision, config, ctx.signal, undefined, redacting.onProgress).finally(
		redacting.clear
	);
	const sessionText = readFileSync(snapshot, "utf8");
	const id = uuidv7();
	const now = new Date();
	const redacted = buildSession(sessionText, applied.redacted, {
		id,
		now,
		leafId: ctx.sessionManager.getLeafId(),
		redacted: decision.redact.length,
		kept: decision.keep.length,
	});
	if (!(await confirmResiduals(ctx, redacted, decision))) return undefined;
	const newPath = join(dirname(original), sessionFileName(id, now));
	writeFileSync(newPath, redacted, { mode: 0o600, flag: "wx" });
	let backupPath: string | undefined;
	if (mode === "encrypted") {
		try {
			backupPath = await writeBackup(
				secretOf(config),
				bundleFor(ctx, original, sessionText, applied.keys, newPath),
				backupDir(config),
				work
			);
		} catch (error) {
			rmSync(newPath, { force: true });
			throw error;
		}
	}
	return { original, newPath, backupPath, mode, decision };
}

function summary(prepared: Prepared): string {
	const occurrences = prepared.decision.redact.reduce((n, c) => n + c.count, 0);
	const groups = new Set(prepared.decision.redact.map(groupLabel)).size;
	const kept = prepared.decision.keep.length;
	const original =
		prepared.mode === "encrypted"
			? `Original encrypted to ${prepared.backupPath} and removed; /nym-restore brings it back.`
			: prepared.mode === "keep"
				? `Original kept at ${prepared.original}.`
				: "Original removed without a backup.";
	return `Redacted ${prepared.decision.redact.length} values (${occurrences} occurrences, ${groups} groups)${kept ? `, kept ${kept}` : ""}. Now in the redacted session. ${original}`;
}

async function redactSession(ctx: ExtensionCommandContext, config: PiNymConfig): Promise<void> {
	if (!ctx.hasUI) {
		ctx.ui.notify("/nym needs the interactive UI to choose what to redact.", "error");
		return;
	}
	await ctx.waitForIdle();
	const work = mkdtempSync(join(tmpdir(), "pi-nym-"));
	try {
		const prepared = await prepare(ctx, config, work);
		if (!prepared) return;
		const message = summary(prepared);
		const result = await ctx.switchSession(prepared.newPath, {
			withSession: async (next) => {
				if (prepared.mode !== "keep") rmSync(prepared.original, { force: true });
				next.ui.notify(message, "info");
			},
		});
		if (result.cancelled) {
			ctx.ui.notify(`Switch cancelled. The redacted session is at ${prepared.newPath}; the original is unchanged.`, "warning");
		}
	} catch (error) {
		ctx.ui.setWidget("pi-nym", undefined);
		ctx.ui.notify(`pi-nym: ${(error as Error).message}. The session is unchanged.`, "error");
	} finally {
		rmSync(work, { recursive: true, force: true });
	}
}

function backupLabel(file: string, bundle?: Bundle): string {
	const name = basename(file).replace(/\.json\.gpg$/, "");
	return bundle?.sessionName ? `${name}  ${bundle.sessionName}` : name;
}

async function restore(ctx: ExtensionCommandContext, config: PiNymConfig): Promise<void> {
	const files = listBackups(backupDir(config));
	if (!files.length) {
		ctx.ui.notify(`No pi-nym backups in ${backupDir(config)}.`, "info");
		return;
	}
	const labels = files.map((f) => backupLabel(f));
	const picked = await ctx.ui.select("Restore which original session?", labels);
	const file = files[labels.indexOf(picked ?? "")];
	if (!file) return;
	try {
		await ctx.waitForIdle();
		await ensureSecret(secretOf(config));
		const bundle = parseBundle(await decrypt(secretOf(config), file));
		const target = existsSync(bundle.originalPath)
			? join(dirname(bundle.originalPath), sessionFileName(uuidv7()))
			: bundle.originalPath;
		writeFileSync(target, bundle.session, { mode: 0o600, flag: "wx" });
		await ctx.switchSession(target, {
			withSession: async (next) =>
				next.ui.notify(`Restored the original session from ${basename(file)}. The encrypted backup is kept.`, "info"),
		});
	} catch (error) {
		ctx.ui.notify(`pi-nym restore: ${(error as Error).message}`, "error");
	}
}

/** A warning when `nym` on PATH is missing or too old; undefined when ready. */
export async function nymStatus(config: PiNymConfig, env: NodeJS.ProcessEnv = process.env): Promise<string | undefined> {
	if (config.nymBinary) {
		return (await isCapable(config.nymBinary))
			? undefined
			: `pi-nym: the configured nymBinary (${config.nymBinary}) is missing or too old for /nym.`;
	}
	const onPath = findOnPath("nym", env);
	if (onPath && (await isCapable(onPath))) return undefined;
	const fallback = await findNym(config, undefined, env).catch(() => undefined);
	const problem = onPath
		? `nym on PATH (${onPath}) is too old for /nym (needs \`traces anon --plan --apply-plan --progress-json\`)`
		: "nym is not on PATH";
	return fallback
		? `pi-nym: ${problem}; using ${fallback}. Install a current nym to silence this.`
		: `pi-nym: ${problem} and no usable local build was found; /nym will not work until nym is installed.`;
}

function modelLabel(model: { provider?: string; id?: string } | undefined): string {
	return model ? `${model.provider}/${model.id}` : "the selected model";
}

export default function (pi: ExtensionAPI) {
	let pending: string | undefined;

	pi.registerCommand("nym", {
		description: "Redact this session locally with nym (e.g. before switching to a cloud model)",
		handler: async (_args, ctx) => redactSession(ctx, loadConfig(ctx.cwd)),
	});

	pi.registerCommand("nym-restore", {
		description: "Restore an original session from an encrypted pi-nym backup",
		handler: async (_args, ctx) => restore(ctx, loadConfig(ctx.cwd)),
	});

	let checked = false;
	pi.on("session_start", async (_event, ctx) => {
		pending = undefined;
		if (checked || !ctx.hasUI) return;
		checked = true;
		const status = await nymStatus(loadConfig(ctx.cwd));
		if (status) ctx.ui.notify(status, "warning");
	});

	pi.on("model_select", async (event, ctx: ExtensionContext) => {
		const config = loadConfig(ctx.cwd);
		pending = undefined;
		if (config.guard === "off" || isLocalModel(event.model.provider, config)) return;
		if (!hasUnredactedContent(ctx.sessionManager.getBranch())) return;
		pending = modelLabel(event.model);
		ctx.ui.notify(`${pending} is not a local model and this session is not redacted. Run /nym to redact it first.`, "warning");
	});

	pi.on("input", async (event, ctx) => {
		if (!pending || event.source !== "interactive" || !ctx.hasUI) return { action: "continue" };
		const config = loadConfig(ctx.cwd);
		if (config.guard !== "confirm") return { action: "continue" };
		const send = await ctx.ui.confirm(
			"Send the unredacted session?",
			`The whole session goes to ${pending} with this prompt. Choose No and run /nym to redact it first.`
		);
		if (send) {
			pending = undefined;
			return { action: "continue" };
		}
		ctx.ui.setEditorText(event.text);
		ctx.ui.notify("Not sent. Run /nym to redact the session, then send again.", "info");
		return { action: "handled" };
	});
}

/**
 * pi-statusline — optional, manifest-driven status footer for pi.
 *
 * Publisher/consumer separation (no hard dependency):
 *   - Extensions publish at-a-glance state via the core API `ctx.ui.setStatus(key, text)`.
 *     Nothing here is imported by them; the core `setStatus` call is the only coupling.
 *   - This (opt-in) extension renders those statuses as colored segments while ALSO
 *     reproducing pi's built-in footer (cwd/branch, token+cost stats, context use and
 *     the current model), so nothing the built-in footer showed is lost.
 *
 * Leading icon:
 *   - On terminals with the Kitty graphics protocol, the real pi press-kit badge
 *     (assets/badge-{size}-{dark|light}.png) is drawn as an inline image sized to the
 *     statusbar height (1-2 rows). It is theme-aware: the white mark on dark
 *     backgrounds, the black mark on light backgrounds.
 *   - On other terminals it falls back to a theme-aware "π" glyph (white in dark,
 *     dark in light), or the manifest `icon` override.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import {
	type ImageProtocol,
	encodeKitty,
	getCapabilities,
	getCellDimensions,
	truncateToWidth,
	visibleWidth,
} from "@earendil-works/pi-tui";

/** Color tokens that map onto Theme.fg (a safe subset of p's ThemeColor). */
type StatusColor = "accent" | "success" | "warning" | "error" | "muted" | "dim" | "text";
const STATUS_COLORS = new Set<StatusColor>(["accent", "success", "warning", "error", "muted", "dim", "text"]);

interface StatuslineItem {
	id: string;
	statusKey: string;
	label: string;
	color?: StatusColor;
	position?: "left" | "right";
	order?: number;
}

interface StatuslineIcon {
	glyph?: string;
	fallback?: string;
	color?: StatusColor;
	/** Row height of the image badge (default 2). */
	rows?: number;
	/** "auto" (detect), "on" (force image), or "off" (force glyph). */
	image?: "auto" | "on" | "off";
}

interface StatuslineManifest {
	version?: number;
	/** When true, render configured items even if no status is published (dimmed). */
	showInactive?: boolean;
	icon?: StatuslineIcon;
	items: StatuslineItem[];
}

interface SessionUsage {
	input: number;
	output: number;
	cacheRead: number;
	cacheWrite: number;
	cost: number;
}

function parseItem(raw: unknown): StatuslineItem | undefined {
	if (!raw || typeof raw !== "object") return undefined;
	const o = raw as Partial<StatuslineItem>;
	if (typeof o.statusKey !== "string") return undefined;
	return {
		id: typeof o.id === "string" ? o.id : o.statusKey,
		statusKey: o.statusKey,
		label: typeof o.label === "string" ? o.label : o.statusKey,
		color: typeof o.color === "string" && STATUS_COLORS.has(o.color as StatusColor) ? (o.color as StatusColor) : "dim",
		position: o.position === "left" ? "left" : "right",
		order: typeof o.order === "number" ? o.order : 1_000,
	};
}

function loadManifest(ctx: ExtensionContext): StatuslineManifest | undefined {
	const candidates = [
		path.join(ctx.cwd, ".pi", "statusline.json"),
		path.join(ctx.cwd, "statusline.json"),
		path.join(os.homedir(), ".pi", "agent", "statusline.json"),
	];
	for (const p of candidates) {
		try {
			if (!fs.existsSync(p)) continue;
			const obj = JSON.parse(fs.readFileSync(p, "utf8")) as Partial<StatuslineManifest>;
			if (!obj || typeof obj !== "object" || !Array.isArray(obj.items)) continue;
			const items = obj.items.map(parseItem).filter((x): x is StatuslineItem => x !== undefined);
			return { version: obj.version, showInactive: obj.showInactive === true, icon: obj.icon, items };
		} catch {
			// Ignore malformed manifest; fall through to the next candidate.
		}
	}
	return undefined;
}

// ---------------------------------------------------------------------------
// Kitty graphics protocol: draw the real pi badge as an inline image.
// ---------------------------------------------------------------------------

const ASSET_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "assets");
const KITTY_IMAGE_ID = 7;

/** Detect image-protocol support: pi's detection, plus a fallback for
e.g. our own PTY/psuedo-terminals that report TERM=screen but forward raw
escapes to a kitty-capable outer terminal. */
function imageProtocol(icon: StatuslineIcon | undefined): ImageProtocol {
	if (icon?.image === "off") return null;
	if (icon?.image === "on") return "kitty";
	const caps = getCapabilities();
	if (caps.images) return caps.images;
	// Fallback: kitty-capable outer terminal even when TERM reports a
	// multiplexer (our herdr pty forwards the raw escapes to the real terminal).
	const prog = (process.env.TERM_PROGRAM || "").toLowerCase();
	if (process.env.KITTY_WINDOW_ID) return "kitty";
	if (prog.includes("kitty") || prog.includes("ghostty") || prog.includes("wezterm")) return "kitty";
	if (process.env.GHOSTTY_RESOURCES_DIR || process.env.GHOSTTY_STATUS_COMMAND) return "kitty";
	if (process.env.WEZTERM_EXECUTABLE) return "kitty";
	return null;
}

/** Resolve whether to render the image badge: auto-detect, force on, or force off. */
function imageEnabled(icon: StatuslineIcon | undefined): boolean {
	return imageProtocol(icon) !== null;
}

/** Whether we should draw the dark (white) or light (black) mark. */
function isDarkBackground(): boolean {
	const cf = process.env.COLORFGBG || "";
	const parts = cf.split(";").map(Number);
	const bg = parts[parts.length - 1];
	if (Number.isFinite(bg)) return bg < 8; // low palette indices are dark base colors
	return true; // default to dark
}

function readBadgePng(rows: number, dark: boolean): { png: string } {
	// Square badge, so width = height; pick the asset size nearest the target height.
	const cell = getCellDimensions();
	const targetPx = Math.round(rows * cell.heightPx);
	const size = targetPx <= 16 ? 16 : targetPx <= 24 ? 24 : 32;
	const file = path.join(ASSET_DIR, `badge-${size}-${dark ? "dark" : "light"}.png`);
	try {
		return { png: fs.readFileSync(file).toString("base64") };
	} catch {
		return { png: "" };
	}
}

/**
 * Return the escape sequence to draw the badge inline at the current cursor,
 * sized to `rows` terminal rows and advancing the cursor past it. Uses pi's
 * encodeKitty (a=T transmit-and-place with c/r cell sizing + cursor movement).
 */
function kittyBadgeEscape(rows: number): string {
	const dark = isDarkBackground();
	const { png } = readBadgePng(rows, dark);
	if (!png) return "";
	const cell = getCellDimensions();
	const cols = Math.max(1, Math.round((rows * cell.heightPx) / cell.widthPx));
	return encodeKitty(png, { columns: cols, rows, imageId: KITTY_IMAGE_ID });
}

/** The icon for a non-kitty terminal: theme-aware glyph, or manifest override. */
function pickGlyph(icon: StatuslineIcon | undefined): { glyph: string; color: StatusColor } {
	const dark = isDarkBackground();
	const glyph = icon?.glyph ?? "π";
	const color = icon?.color ?? (dark ? "text" : "text");
	return { glyph, color };
}

/** Compact token formatter matching pi's footer (1.2k, 3.4M, ...). */
function formatTokens(n: number): string {
	if (!Number.isFinite(n) || n <= 0) return "0";
	if (n < 1000) return String(n);
	const units = ["k", "M", "G", "T"];
	let v = n;
	let i = -1;
	while (v >= 1000 && i < units.length - 1) {
		v /= 1000;
		i++;
	}
	return `${v.toFixed(v < 10 ? 1 : 0)}${units[i]}`;
}

/** Sum token/cost usage across the session's assistant messages. */
function computeUsage(sm: ExtensionContext["sessionManager"]): SessionUsage {
	const usage: SessionUsage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0 };
	for (const entry of sm.getEntries()) {
		if (entry.type !== "message" || entry.message.role !== "assistant") continue;
		const u = entry.message.usage;
		usage.input += u?.input ?? 0;
		usage.output += u?.output ?? 0;
		usage.cacheRead += u?.cacheRead ?? 0;
		usage.cacheWrite += u?.cacheWrite ?? 0;
		usage.cost += u?.cost?.total ?? 0;
	}
	return usage;
}

/** Build the left stats block and the right-aligned model label for the footer. */
function buildStats(
	ctx: ExtensionContext,
	usage: SessionUsage,
	providerCount: number,
	theme: { fg(color: string, text: string): string }
): { left: string; right: string } {
	const model = ctx.model;
	const contextUsage = ctx.getContextUsage();
	const contextWindow = contextUsage?.contextWindow ?? model?.contextWindow ?? 0;
	const percent = contextUsage?.percent;
	const contextDisplay = `${percent === null ? "?" : (percent ?? 0).toFixed(1)}%/${formatTokens(contextWindow)}`;
	const coloredContext =
		(percent ?? 0) > 90
			? theme.fg("error", contextDisplay)
			: (percent ?? 0) > 70
				? theme.fg("warning", contextDisplay)
				: contextDisplay;

	const statsParts: string[] = [];
	if (usage.input) statsParts.push(`↑${formatTokens(usage.input)}`);
	if (usage.output) statsParts.push(`↓${formatTokens(usage.output)}`);
	if (usage.cacheRead) statsParts.push(`R${formatTokens(usage.cacheRead)}`);
	if (usage.cacheWrite) statsParts.push(`W${formatTokens(usage.cacheWrite)}`);
	const usingSub = model ? ctx.modelRegistry.isUsingOAuth(model) : false;
	if (usage.cost || usingSub) statsParts.push(`$${usage.cost.toFixed(3)}${usingSub ? " (sub)" : ""}`);
	statsParts.push(coloredContext);

	const modelName = model?.id || "no-model";
	const right = providerCount > 1 && model ? `(${model.provider}) ${modelName}` : modelName;
	return { left: statsParts.join(" "), right };
}

/** Right-align a right field against a left field on a fixed width; falls back gracefully. */
function alignLeftRight(left: string, right: string, width: number): string {
	const leftWidth = visibleWidth(left);
	const rightWidth = visibleWidth(right);
	const minPad = 2;
	if (leftWidth + minPad + rightWidth <= width) {
		return left + " ".repeat(width - leftWidth - rightWidth) + right;
	}
	const avail = width - leftWidth - minPad;
	if (avail > 0) {
		const tr = truncateToWidth(right, avail, "");
		return left + " ".repeat(Math.max(0, width - leftWidth - visibleWidth(tr))) + tr;
	}
	return truncateToWidth(left, width, "...");
}

/** Build the colored extension-status segments for the footer line. */
function buildStatusSegments(
	ordered: StatuslineItem[],
	statuses: ReadonlyMap<string, string>,
	showInactive: boolean,
	theme: { fg(color: string, text: string): string }
): string[] {
	const segments: string[] = [];
	for (const item of ordered) {
		const status = statuses.get(item.statusKey);
		if (status === undefined || status === "") {
			if (showInactive) segments.push(theme.fg("dim", item.label));
			continue;
		}
		segments.push(`${theme.fg(item.color ?? "dim", item.label)} ${status}`);
	}
	return segments;
}

export default function (pi: ExtensionAPI) {
	pi.on("session_start", (_event, ctx) => {
		if (!ctx.hasUI) return; // print/RPC mode: no footer to build
		const manifest = loadManifest(ctx);
		if (!manifest || manifest.items.length === 0) return; // no manifest -> keep built-in footer
		try {
			ctx.ui.setFooter((_tui, theme, footerData) => {
				const ordered = [...manifest.items].sort((a, b) => (a.order ?? 1_000) - (b.order ?? 1_000));
				const showInactive = manifest.showInactive === true;
				const rows = Math.max(1, Math.min(2, manifest.icon?.rows ?? 2));
				return {
					render: (width: number) => {
						const sm = ctx.sessionManager;
						const home = process.env.HOME || process.env.USERPROFILE;
						const usage = computeUsage(sm);
						const { left: statsLeft, right: rightSide } = buildStats(ctx, usage, footerData.getAvailableProviderCount(), theme);

						// --- pwd line (cwd + branch + session name) ---
						let pwd = sm.getCwd();
						if (home && pwd.startsWith(home)) pwd = `~${pwd.slice(home.length)}`;
						const branch = footerData.getGitBranch();
						if (branch) pwd = `${pwd} (${branch})`;
						const sessionName = sm.getSessionName();
						if (sessionName) pwd = `${pwd} • ${sessionName}`;

						const lines: string[] = [];
						if (imageEnabled(manifest.icon)) {
							lines.push(`${kittyBadgeEscape(rows)} ${pwd}`);
						} else {
							const glyph = pickGlyph(manifest.icon);
							lines.push(truncateToWidth(`${theme.fg(glyph.color, glyph.glyph)} ${pwd}`, width, theme.fg("dim", "...")));
						}
						lines.push(theme.fg("dim", alignLeftRight(statsLeft, rightSide, width)));
						const segments = buildStatusSegments(ordered, footerData.getExtensionStatuses(), showInactive, theme);
						if (segments.length > 0) {
							lines.push(truncateToWidth(segments.join(theme.fg("dim", " • ")), width, theme.fg("dim", "...")));
						}
						return lines;
					},
					// biome-ignore lint/suspicious/noEmptyBlockStatements: footer re-rendered via setStatus internally
					invalidate: () => {},
				};
			});
		} catch {
			// Footer not supported in this UI mode; fall back to the built-in footer.
		}
	});
}

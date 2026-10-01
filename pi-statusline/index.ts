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
 *   - Kitty graphics support is detected by asking the terminal (a Kitty graphics
 *     query answered with OK), not by matching terminal names, so multiplexers that
 *     implement the protocol (herdr) work even when TERM says xterm-256color.
 *   - On terminals with the Kitty graphics protocol, the real pi press-kit badge
 *     (assets/badge-{size}-{dark|light}.png) is drawn as an inline image sized to the
 *     statusbar height (1 row by default, 2 via icon.rows). It is theme-aware: the white mark on dark
 *     backgrounds, the black mark on light backgrounds.
 *   - On other terminals it falls back to a theme-aware "π" glyph (white in dark,
 *     dark in light), or the manifest `icon` override.
 */

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import {
	type TUI,
	allocateImageId,
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
	/** Row height of the image badge (default 1). */
	rows?: number;
	/** "auto" (detect), "on" (force image), or "off" (force glyph). */
	image?: "auto" | "on" | "off";
}

interface StatuslineManifest {
	version?: number;
	/** When true, render configured items even if no status is published (dimmed). */
	showInactive?: boolean;
	icon?: StatuslineIcon;
	/** Show the cwd project's icon/icon_on_{dark,light} at the right of the pwd line (default true). */
	projectIcon?: boolean;
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
			return {
				version: obj.version,
				showInactive: obj.showInactive === true,
				icon: obj.icon,
				projectIcon: obj.projectIcon !== false,
				items,
			};
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
let badgeImageId: number | undefined;

// Kitty graphics query: a 1x1 RGB pixel with a=q (query only, nothing is stored or
// drawn), followed by DA1 as a sentinel every terminal answers. A terminal that
// implements the protocol replies `ESC_Gi=<id>;OK ESC\` before the DA1 reply.
const KITTY_QUERY_ID = 31;
const KITTY_QUERY = `\x1b_Gi=${KITTY_QUERY_ID},s=1,v=1,a=q,t=d,f=24;AAAA\x1b\\\x1b[c`;
// biome-ignore lint/suspicious/noControlCharactersInRegex: matching terminal escape replies
const KITTY_REPLY_RE = /\x1b_Gi=31;([^\x1b]*)\x1b\\/;
// biome-ignore lint/suspicious/noControlCharactersInRegex: matching terminal escape replies
const DA1_REPLY_RE = /\x1b\[\?[\d;]*c/;
const PROBE_TIMEOUT_MS = 1_500;

/** Result of the terminal query: undefined until answered (or timed out). */
let kittyProbe: boolean | undefined;
let probeStarted = false;

/**
 * Ask the terminal whether it implements Kitty graphics. Replies arrive on stdin,
 * so an input listener strips them before pi sees them as keystrokes.
 */
function probeKittyGraphics(tui: TUI): void {
	if (probeStarted || !process.stdout.isTTY) return;
	probeStarted = true;
	let graphicsReply: boolean | undefined;
	// Keep listening until the DA1 sentinel so neither reply leaks into the editor.
	const stop = tui.addInputListener((data) => {
		let rest = data;
		const reply = KITTY_REPLY_RE.exec(rest);
		if (reply) {
			rest = rest.replace(reply[0], "");
			graphicsReply = reply[1] === "OK";
		}
		const da1 = DA1_REPLY_RE.exec(rest);
		if (da1) {
			rest = rest.replace(da1[0], "");
			finish();
		}
		if (rest === data) return undefined;
		return rest.length === 0 ? { consume: true } : { data: rest };
	});
	const timer = setTimeout(finish, PROBE_TIMEOUT_MS);
	tui.terminal.write(KITTY_QUERY);

	function finish(): void {
		if (kittyProbe !== undefined) return;
		kittyProbe = graphicsReply === true;
		stop();
		clearTimeout(timer);
		// Cell size in pixels sizes the badge; pi-tui consumes the reply itself.
		if (kittyProbe) tui.terminal.write("\x1b[16t");
		tui.requestRender(true);
	}
}

/** Resolve whether to render the image badge: manifest override, then detection. */
function imageEnabled(icon: StatuslineIcon | undefined): boolean {
	if (icon?.image === "off") return false;
	if (icon?.image === "on") return true;
	return getCapabilities().images === "kitty" || kittyProbe === true;
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

/** Width in cells of a square badge `rows` cells tall. */
function badgeCols(rows: number): number {
	const cell = getCellDimensions();
	return Math.max(1, Math.round((rows * cell.heightPx) / cell.widthPx));
}

/**
 * Return the escape sequence to draw the badge at the current cursor, `rows` tall,
 * leaving the cursor just right of it on the same row. The image is drawn with
 * C=1 (no terminal cursor movement): Kitty would otherwise move the cursor down
 * by the image height, breaking pi-tui's line accounting for a 2-row badge.
 */
function kittyBadgeEscape(rows: number): string {
	const { png } = readBadgePng(rows, isDarkBackground());
	if (!png) return "";
	badgeImageId ??= allocateImageId();
	const cols = badgeCols(rows);
	return `${encodeKitty(png, { columns: cols, rows, imageId: badgeImageId, moveCursor: false })}\x1b[${cols}C`;
}

// ---------------------------------------------------------------------------
// Project icon (byteowlz repository standard): icon/icon_on_{dark,light}.{png,svg}
// in the project, drawn one row tall at the right end of the pwd line.
// ---------------------------------------------------------------------------

const ICON_CACHE_DIR = path.join(os.homedir(), ".cache", "pi-statusline");
const ICON_RENDER_PX = 64;
let projectIconImageId: number | undefined;
/** base64 PNG per `<cwd>\0<variant>`; "" when the project ships no matching icon. */
const projectIconCache = new Map<string, string>();

/**
 * Find the project icon for `cwd`: the nearest directory from cwd up to the git
 * root (or home) that ships icon/icon_<variant>.png or .svg. PNG wins over SVG.
 */
export function findProjectIcon(cwd: string, variant: "on_dark" | "on_light"): string | undefined {
	const home = os.homedir();
	let dir = path.resolve(cwd);
	for (;;) {
		for (const ext of ["png", "svg"]) {
			const file = path.join(dir, "icon", `icon_${variant}.${ext}`);
			if (fs.existsSync(file)) return file;
		}
		const parent = path.dirname(dir);
		if (fs.existsSync(path.join(dir, ".git")) || dir === home || parent === dir) return undefined;
		dir = parent;
	}
}

/** Rasterise an SVG icon once into the cache (rsvg-convert, else ImageMagick). */
function rasteriseSvg(svg: string): string | undefined {
	const key = createHash("sha1")
		.update(`${svg}\0${fs.statSync(svg).mtimeMs}`)
		.digest("hex")
		.slice(0, 16);
	const out = path.join(ICON_CACHE_DIR, `${key}.png`);
	if (fs.existsSync(out)) return out;
	fs.mkdirSync(ICON_CACHE_DIR, { recursive: true });
	const px = String(ICON_RENDER_PX);
	const renderers: [string, string[]][] = [
		["rsvg-convert", ["-w", px, "-h", px, "-a", svg, "-o", out]],
		["magick", ["-background", "none", "-density", "384", svg, "-resize", `${px}x${px}`, out]],
	];
	for (const [cmd, args] of renderers) {
		const result = spawnSync(cmd, args, { timeout: 5_000, stdio: "ignore" });
		if (result.status === 0 && fs.existsSync(out)) return out;
	}
	return undefined;
}

function projectIconPng(cwd: string, dark: boolean): string {
	const variant = dark ? "on_dark" : "on_light";
	const key = `${cwd}\0${variant}`;
	const cached = projectIconCache.get(key);
	if (cached !== undefined) return cached;
	let png = "";
	try {
		const file = findProjectIcon(cwd, variant);
		const pngFile = file?.endsWith(".svg") ? rasteriseSvg(file) : file;
		if (pngFile) png = fs.readFileSync(pngFile).toString("base64");
	} catch {
		// Unreadable or unrenderable icon: show nothing.
	}
	projectIconCache.set(key, png);
	return png;
}

/** Escape to draw the project icon one row tall at the cursor, or "" when there is none. */
function projectIconEscape(cwd: string): string {
	const png = projectIconPng(cwd, isDarkBackground());
	if (!png) return "";
	projectIconImageId ??= allocateImageId();
	return encodeKitty(png, { columns: badgeCols(1), rows: 1, imageId: projectIconImageId, moveCursor: false });
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

/**
 * Build the pwd + stats lines, led by the image badge when the terminal supports
 * it (text on the lines the badge spans is indented past it) or the glyph otherwise.
 * `projectIcon` (an image escape, or "") is right-aligned on the pwd line.
 */
function buildHeaderLines(
	pwd: string,
	stats: { left: string; right: string },
	icon: StatuslineIcon | undefined,
	projectIcon: string,
	rows: number,
	width: number,
	theme: { fg(color: string, text: string): string }
): string[] {
	const ellipsis = theme.fg("dim", "...");
	const badge = imageEnabled(icon) ? kittyBadgeEscape(rows) : "";
	if (!badge) {
		const glyph = pickGlyph(icon);
		return [
			truncateToWidth(`${theme.fg(glyph.color, glyph.glyph)} ${pwd}`, width, ellipsis),
			theme.fg("dim", alignLeftRight(stats.left, stats.right, width)),
		];
	}
	const indent = badgeCols(rows) + 1;
	const textWidth = Math.max(1, width - indent);
	const iconCols = projectIcon ? badgeCols(1) : 0;
	const pwdText = truncateToWidth(pwd, projectIcon ? Math.max(1, textWidth - iconCols - 1) : textWidth, ellipsis);
	let pwdLine = `${badge} ${pwdText}`;
	if (projectIcon) {
		pwdLine += `${" ".repeat(Math.max(1, textWidth - visibleWidth(pwdText) - iconCols))}${projectIcon}`;
	}
	if (rows === 1) return [pwdLine, theme.fg("dim", alignLeftRight(stats.left, stats.right, width))];
	return [pwdLine, `${" ".repeat(indent)}${theme.fg("dim", alignLeftRight(stats.left, stats.right, textWidth))}`];
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
			ctx.ui.setFooter((tui, theme, footerData) => {
				if (manifest.icon?.image !== "on" && manifest.icon?.image !== "off" && !getCapabilities().images) {
					probeKittyGraphics(tui);
				}
				const ordered = [...manifest.items].sort((a, b) => (a.order ?? 1_000) - (b.order ?? 1_000));
				const showInactive = manifest.showInactive === true;
				const rows = Math.max(1, Math.min(2, manifest.icon?.rows ?? 1));
				const showProjectIcon = manifest.projectIcon !== false;
				return {
					render: (width: number) => {
						const sm = ctx.sessionManager;
						const home = process.env.HOME || process.env.USERPROFILE;
						const usage = computeUsage(sm);
						const stats = buildStats(ctx, usage, footerData.getAvailableProviderCount(), theme);

						// --- pwd line (cwd + branch + session name) ---
						let pwd = sm.getCwd();
						if (home && pwd.startsWith(home)) pwd = `~${pwd.slice(home.length)}`;
						const branch = footerData.getGitBranch();
						if (branch) pwd = `${pwd} (${branch})`;
						const sessionName = sm.getSessionName();
						if (sessionName) pwd = `${pwd} • ${sessionName}`;

						const projectIcon = showProjectIcon && imageEnabled(manifest.icon) ? projectIconEscape(sm.getCwd()) : "";
						const lines = buildHeaderLines(pwd, stats, manifest.icon, projectIcon, rows, width, theme);
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

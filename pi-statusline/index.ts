/**
 * pi-statusline — optional, manifest-driven status footer for pi.
 *
 * Publisher/consumer separation (no hard dependency):
 *   - Extensions publish at-a-glance state via the core API `ctx.ui.setStatus(key, text)`.
 *     Nothing here is imported by them; the core `setStatus` call is the only coupling.
 *   - This (opt-in) extension renders those statuses as colored segments while ALSO
 *     reproducing pi's built-in footer (cwd/branch, token+cost stats, context use and
 *     the current model), so nothing the built-in footer showed is lost. It reads a
 *     central manifest (statusline.json) that maps each statusKey to a label, color and
 *     position. If this extension is not installed, extensions still work and the
 *     built-in footer shows their status on the default dim line.
 *
 * Manifest is looked up (first match wins):
 *   1. <cwd>/.pi/statusline.json
 *   2. <cwd>/statusline.json
 *   3. ~/.pi/agent/statusline.json
 * See statusline.example.json for the shape and statusline.schema.json for validation.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

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
}

interface StatuslineManifest {
	version?: number;
	/** When true, render configured items even if no status is published (dimmed). */
	showInactive?: boolean;
	/** Optional leading pi icon (glyph + fallback + color). */
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
			const icon =
				obj.icon && typeof obj.icon === "object"
					? {
							glyph: typeof obj.icon.glyph === "string" ? obj.icon.glyph : undefined,
							fallback: typeof obj.icon.fallback === "string" ? obj.icon.fallback : undefined,
							color:
								typeof obj.icon.color === "string" && STATUS_COLORS.has(obj.icon.color as StatusColor)
									? (obj.icon.color as StatusColor)
									: undefined,
						}
					: undefined;
			return { version: obj.version, showInactive: obj.showInactive === true, icon, items };
		} catch {
			// Ignore malformed manifest; fall through to the next candidate.
		}
	}
	return undefined;
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
			// No active status: dim the label as a standby marker so tracked items stay visible.
			if (showInactive) segments.push(theme.fg("dim", item.label));
			continue;
		}
		segments.push(`${theme.fg(item.color ?? "dim", item.label)} ${status}`);
	}
	return segments;
}

/** Render the pi agent logo as compact block art using its real brand colors. */
const PI_SALMON: [number, number, number] = [240, 144, 130];
const PI_BLUE: [number, number, number] = [77, 154, 191];
const PI_YELLOW: [number, number, number] = [241, 190, 88];
// Pinwheel derived from pi.dev/logo.svg paths (s=salmon, b=blue, y=yellow, ""=empty).
const PI_LOGO_MARK: ("s" | "b" | "y" | "")[][] = [
	["s", "s", "s", ""],
	["b", "s", "", ""],
	["b", "b", "", "y"],
	["b", "", "", "y"],
];
const PI_COLOR: Record<string, [number, number, number]> = {
	s: PI_SALMON,
	b: PI_BLUE,
	y: PI_YELLOW,
};

function renderPiLogo(): string[] {
	return PI_LOGO_MARK.map((row) =>
		row
			.map((cell) => {
				if (cell === "") return " ";
				const [r, g, b] = PI_COLOR[cell];
				return `\x1b[38;2;${r};${g};${b}m█\x1b[39m`;
			})
			.join("")
	);
}

function terminalSupportsGlyph(): boolean {
	const term = (process.env.TERM || "").toLowerCase();
	return !(term === "dumb" || term === "linux" || term === "cons25");
}

/** Resolve the leading icon: the real block logo by default, or an explicit glyph override. */
function pickIcon(icon: StatuslineIcon | undefined): { kind: "logo" } | { kind: "glyph"; glyph: string; color: StatusColor } {
	const rich = terminalSupportsGlyph();
	if (icon?.glyph || icon?.fallback) {
		return {
			kind: "glyph",
			glyph: rich ? (icon.glyph ?? icon.fallback ?? "π") : (icon.fallback ?? "pi"),
			color: icon?.color ?? "text",
		};
	}
	if (rich) return { kind: "logo" };
	return { kind: "glyph", glyph: "pi", color: "text" };
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
				return {
					render: (width: number) => {
						const sm = ctx.sessionManager;
						const home = process.env.HOME || process.env.USERPROFILE;
						const usage = computeUsage(sm);
						const icon = pickIcon(manifest.icon);
						const { left: statsLeft, right: rightSide } = buildStats(ctx, usage, footerData.getAvailableProviderCount(), theme);

						// --- pwd line (cwd + branch + session name) ---
						let pwd = sm.getCwd();
						if (home && pwd.startsWith(home)) pwd = `~${pwd.slice(home.length)}`;
						const branch = footerData.getGitBranch();
						if (branch) pwd = `${pwd} (${branch})`;
						const sessionName = sm.getSessionName();
						if (sessionName) pwd = `${pwd} • ${sessionName}`;

						const lines: string[] = [];
						if (icon.kind === "logo") {
							lines.push(...renderPiLogo());
							lines.push(truncateToWidth(theme.fg("dim", pwd), width, theme.fg("dim", "...")));
						} else {
							lines.push(truncateToWidth(`${theme.fg(icon.color, icon.glyph)} ${pwd}`, width, theme.fg("dim", "...")));
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

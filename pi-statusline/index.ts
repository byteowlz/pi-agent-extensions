/**
 * pi-statusline — optional, manifest-driven status footer for pi.
 *
 * Publisher/consumer separation (no hard dependency):
 *   - Extensions publish at-a-glance state via the core API `ctx.ui.setStatus(key, text)`.
 *     Nothing here is imported by them; the core `setStatus` call is the only coupling.
 *   - This (opt-in) extension renders those statuses as colored segments on ONE line by
 *     replacing the built-in footer. It reads a central manifest (statusline.json) that
 *     maps each statusKey to a label, color and position. If this extension is not
 *     installed, extensions still work and the built-in footer shows their status on the
 *     default dim line.
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

/** Color tokens that map onto Theme.fg (a safe subset of p's ThemeColor). */
const STATUS_COLORS = new Set(["accent", "success", "warning", "error", "muted", "dim", "text"]) as Set<string>;

interface StatuslineItem {
	id: string;
	statusKey: string;
	label: string;
	color?: string;
	position?: "left" | "right";
	order?: number;
}

interface StatuslineManifest {
	version?: number;
	items: StatuslineItem[];
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
			const raw = JSON.parse(fs.readFileSync(p, "utf8")) as unknown;
			const obj = raw as Partial<StatuslineManifest>;
			if (!obj || typeof obj !== "object" || !Array.isArray(obj.items)) continue;
			const items: StatuslineItem[] = [];
			for (const it of obj.items) {
				if (!it || typeof it !== "object") continue;
				const o = it as Partial<StatuslineItem>;
				if (typeof o.statusKey !== "string") continue;
				items.push({
					id: typeof o.id === "string" ? o.id : o.statusKey,
					statusKey: o.statusKey,
					label: typeof o.label === "string" ? o.label : o.statusKey,
					color: typeof o.color === "string" && STATUS_COLORS.has(o.color) ? o.color : "dim",
					position: o.position === "left" ? "left" : "right",
					order: typeof o.order === "number" ? o.order : 1_000,
				});
			}
			return { version: obj.version, items };
		} catch {
			// Ignore malformed manifest; fall through to the next candidate.
		}
	}
	return undefined;
}

export default function (pi: ExtensionAPI) {
	pi.on("session_start", (_event, ctx) => {
		if (!ctx.hasUI) return; // print/RPC mode: no footer to build
		const manifest = loadManifest(ctx);
		if (!manifest || manifest.items.length === 0) return; // no manifest -> keep built-in footer
		try {
			ctx.ui.setFooter((_tui, theme, footerData) => {
				const ordered = [...manifest.items].sort((a, b) => (a.order ?? 1_000) - (b.order ?? 1_000));
				return {
					render: (width: number) => {
						const statuses = footerData.getExtensionStatuses();
						const segments: string[] = [];
						for (const item of ordered) {
							const status = statuses.get(item.statusKey);
							if (status === undefined || status === "") continue;
							const label = theme.fg(item.color as "accent", item.label);
							segments.push(`${label} ${status}`);
						}
						const branch = footerData.getGitBranch();
						if (branch) segments.unshift(theme.fg("dim", branch));
						if (segments.length === 0) return [];
						return [segments.join(theme.fg("dim", " • ")).slice(0, Math.max(0, width))];
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

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { truncateToWidth } from "@earendil-works/pi-tui";

type MessagePart = { type?: string; text?: string };
type BranchEntry = {
	type?: string;
	timestamp?: string;
	message?: {
		role?: string;
		content?: string | MessagePart[];
		timestamp?: number | string | Date;
	};
};

const WIDGET_KEY = "message-timestamps";
const MAX_LINES = 8;

function pad2(v: number): string {
	return String(v).padStart(2, "0");
}

function isSameDay(a: Date, b: Date): boolean {
	return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function formatStamp(ts: Date, now: Date): string {
	const hhmm = `${pad2(ts.getHours())}:${pad2(ts.getMinutes())}`;
	if (isSameDay(ts, now)) return hhmm;
	const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
	if (isSameDay(ts, yesterday)) return `Yesterday ${hhmm}`;
	return `${ts.getFullYear()}-${pad2(ts.getMonth() + 1)}-${pad2(ts.getDate())} ${hhmm}`;
}

function toDate(value: unknown): Date | null {
	if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
	if (typeof value === "number") {
		const d = new Date(value);
		return Number.isNaN(d.getTime()) ? null : d;
	}
	if (typeof value === "string" && value.length > 0) {
		const d = new Date(value);
		return Number.isNaN(d.getTime()) ? null : d;
	}
	return null;
}

function extractText(content: string | MessagePart[] | undefined): string {
	if (typeof content === "string") return content.replace(/\s+/g, " ").trim();
	if (!Array.isArray(content)) return "";
	return content
		.filter((p) => p.type === "text" && typeof p.text === "string")
		.map((p) => (p.text ?? "").replace(/\s+/g, " ").trim())
		.filter(Boolean)
		.join(" ");
}

function renderWidget(ctx: ExtensionContext): void {
	const branch = ctx.sessionManager.getBranch() as BranchEntry[];
	const now = new Date();
	const rows = branch
		.filter((entry) => entry.type === "message" && (entry.message?.role === "user" || entry.message?.role === "assistant"))
		.map((entry) => {
			const ts = toDate(entry.message?.timestamp) ?? toDate(entry.timestamp);
			const role = entry.message?.role === "assistant" ? "A" : "U";
			const text = extractText(entry.message?.content);
			return { ts, role, text };
		})
		.filter((r) => r.ts && r.text)
		.slice(-MAX_LINES) as { ts: Date; role: "A" | "U"; text: string }[];

	if (rows.length === 0) {
		ctx.ui.setWidget(WIDGET_KEY, undefined);
		return;
	}

	ctx.ui.setWidget(
		WIDGET_KEY,
		(_tui, theme) => ({
			render: (width: number) => {
				const inner = Math.max(10, width);
				const lines = [theme.fg("dim", "⏱ Recent message times")];
				for (const row of rows) {
					const stamp = formatStamp(row.ts, now);
					const prefix = theme.fg("dim", `[${stamp}] ${row.role}: `);
					lines.push(truncateToWidth(prefix + row.text, inner, "…"));
				}
				return lines;
			},
		}),
		{ placement: "belowEditor" }
	);
}

export default function messageTimestampsExtension(pi: ExtensionAPI) {
	pi.on("session_start", async (_event, ctx) => {
		if (!ctx.hasUI) return;
		renderWidget(ctx);
	});

	pi.on("session_tree", async (_event, ctx) => {
		if (!ctx.hasUI) return;
		renderWidget(ctx);
	});

	pi.on("turn_end", async (_event, ctx) => {
		if (!ctx.hasUI) return;
		renderWidget(ctx);
	});
}

import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";

type GuardConfig = {
	enabled: boolean;
	maxTextChars: number;
	previewChars: number;
	notify: boolean;
};

type AnyBlock = { type: string; [key: string]: unknown };

type ReadToolInput = {
	path?: string;
	offset?: number;
	limit?: number;
	[key: string]: unknown;
};

const CONFIG_FILENAME = "read-file-guard.json";
const DEFAULT_CONFIG: GuardConfig = {
	enabled: true,
	maxTextChars: 80_000,
	previewChars: 6_000,
	notify: true,
};

function loadConfig(ctx: ExtensionContext): GuardConfig {
	const cwd = ctx.sessionManager.getCwd();
	const candidates = [
		join(cwd, CONFIG_FILENAME),
		join(cwd, ".pi", CONFIG_FILENAME),
		join(homedir(), ".pi", "agent", CONFIG_FILENAME),
	];

	for (const path of candidates) {
		if (!existsSync(path)) continue;
		try {
			const parsed = JSON.parse(readFileSync(path, "utf-8")) as Partial<GuardConfig>;
			return { ...DEFAULT_CONFIG, ...parsed };
		} catch {
			// Ignore invalid config and continue.
		}
	}

	return DEFAULT_CONFIG;
}

function formatChars(chars: number): string {
	if (chars < 1_000) return `${chars} chars`;
	if (chars < 1_000_000) return `${(chars / 1_000).toFixed(1)}k chars`;
	return `${(chars / 1_000_000).toFixed(2)}M chars`;
}

function extractTextContent(content: unknown): string {
	if (typeof content === "string") return content;
	if (!Array.isArray(content)) return "";

	let out = "";
	for (const block of content) {
		if (
			typeof block === "object" &&
			block !== null &&
			(block as { type?: unknown }).type === "text" &&
			typeof (block as { text?: unknown }).text === "string"
		) {
			if (out.length > 0) out += "\n\n";
			out += (block as { text: string }).text;
		}
	}
	return out;
}

function buildGuardText(inputPath: string | undefined, originalChars: number, preview: string): string {
	const pathNote = inputPath ? ` for ${inputPath}` : "";
	const cleanedPreview = preview.trim();
	const previewSection = cleanedPreview.length > 0 ? `\n\n--- Preview (truncated) ---\n${cleanedPreview}` : "";

	return `[read-file-guard] Truncated oversized read output${pathNote} (${formatChars(originalChars)}). This prevents provider request/body overflows and runaway context growth. Use chunked reads (offset/limit) or convert large documents (for example with ingestr) before continuing.${previewSection}`;
}

function toGuardedContent(text: string): AnyBlock[] {
	return [{ type: "text", text }] as AnyBlock[];
}

function getInputPath(input: unknown): string | undefined {
	if (!input || typeof input !== "object") return undefined;
	const path = (input as ReadToolInput).path;
	return typeof path === "string" && path.trim().length > 0 ? path : undefined;
}

export default function (pi: ExtensionAPI): void {
	pi.on("tool_result", async (event, ctx) => {
		if (event.toolName !== "read") return;

		const config = loadConfig(ctx);
		if (!config.enabled) return;

		const inputPath = getInputPath(event.input);
		const text = extractTextContent(event.content);
		if (!text || text.length <= config.maxTextChars) return;

		const preview = text.slice(0, Math.max(0, config.previewChars));
		const rewrittenText = buildGuardText(inputPath, text.length, preview);
		const rewrittenContent = toGuardedContent(rewrittenText);

		if (config.notify && ctx.hasUI) {
			ctx.ui.notify(`read-file-guard: truncated oversized read payload (${formatChars(text.length)}).`, "warning");
		}

		return { content: rewrittenContent };
	});
}

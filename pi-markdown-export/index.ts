import { writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

type MessagePart = { type?: string; text?: string; thinking?: string };
type BranchEntry = { type?: string; message?: { role?: string; content?: string | MessagePart[] } };

function timestampSlug(): string {
	return new Date().toISOString().replace(/[:.]/g, "-");
}

function extractText(content: string | MessagePart[] | undefined): string {
	if (typeof content === "string") return content.trim();
	if (!Array.isArray(content)) return "";
	return content
		.filter((p) => p.type === "text" && typeof p.text === "string")
		.map((p) => p.text?.trim() ?? "")
		.filter(Boolean)
		.join("\n");
}

function toMarkdown(ctx: ExtensionContext, sessionName: string | null): string {
	const branch = ctx.sessionManager.getBranch() as BranchEntry[];
	const title = sessionName?.trim() || "Pi Session Export";
	const lines: string[] = [`# ${title}`, "", `Exported: ${new Date().toISOString()}`, ""];

	for (const entry of branch) {
		if (entry.type !== "message" || !entry.message) continue;
		const role = entry.message.role === "assistant" ? "Assistant" : entry.message.role === "user" ? "User" : "System";
		const text = extractText(entry.message.content);
		if (!text) continue;
		lines.push(`## ${role}`, "", text, "");
	}

	return `${lines.join("\n")}\n`;
}

export default function (pi: ExtensionAPI) {
	pi.registerCommand("export-md", {
		description: "Export current session to Markdown. Usage: /export-md [filename.md]",
		handler: async (args, ctx) => {
			const provided = args.trim();
			const fileName = provided || `pi-session-${timestampSlug()}.md`;
			const outPath = fileName.startsWith("/") ? fileName : join(ctx.cwd, fileName);

			const markdown = toMarkdown(ctx, pi.getSessionName());
			writeFileSync(outPath, markdown, "utf-8");
			ctx.ui.notify(`Markdown export written: ${outPath}`, "info");
		},
	});
}

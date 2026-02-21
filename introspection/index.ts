import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { readdirSync, existsSync, readFileSync } from "node:fs";
import { join, basename } from "node:path";

// Try to get session title from multiple sources
function getSessionTitle(pi: ExtensionAPI, sessionManager: any): string | null {
  // Try direct API first
  const directTitle = (pi as any).getSessionTitle?.();
  if (directTitle) return directTitle;
  
  // Try to get from sessionManager metadata
  const metadata = sessionManager.getMetadata?.();
  if (metadata?.title) return metadata.title;
  
  // Try to get from first entry metadata
  const entries = sessionManager.getEntries?.() || [];
  for (const entry of entries) {
    if (entry.metadata?.title) return entry.metadata.title;
    if (entry.title) return entry.title;
  }
  
  return null;
}

interface ExtensionInfo {
  name: string;
  description?: string;
  hasPackageJson: boolean;
}

// Discover installed extensions by reading the extensions directory
function discoverExtensions(cwd: string): ExtensionInfo[] {
  const extensions: ExtensionInfo[] = [];

  // Check both global and project-local extension directories
  const home = process.env.HOME ?? "";
  const dirs = [
    join(home, ".pi", "agent", "extensions"),
    join(cwd, ".pi", "extensions"),
  ];

  for (const dir of dirs) {
    if (!existsSync(dir)) continue;

    try {
      const entries = readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        if (entry.name.startsWith(".")) continue;

        const extDir = join(dir, entry.name);
        const indexPath = join(extDir, "index.ts");
        if (!existsSync(indexPath)) continue;

        // Try to read description from package.json
        let description: string | undefined;
        let hasPackageJson = false;
        const pkgPath = join(extDir, "package.json");
        if (existsSync(pkgPath)) {
          hasPackageJson = true;
          try {
            const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
            description = pkg.description;
          } catch {
            // ignore parse errors
          }
        }

        extensions.push({
          name: entry.name,
          description,
          hasPackageJson,
        });
      }
    } catch {
      // directory not readable
    }
  }

  return extensions;
}

export default function (pi: ExtensionAPI) {
  // Register the self_reflection tool
  pi.registerTool({
    name: "self_reflection",
    label: "Self Reflection",
    description:
      "Query information about the current pi session, including the active model, context usage, and configuration. " +
      "Use this when you need to know which model you are, what your capabilities are, or session metadata.",
    parameters: Type.Object({
      info: Type.Optional(
        Type.String({
          description:
            "Specific information to query (model, session, context, all). Defaults to 'all'.",
          enum: ["model", "session", "context", "all"],
        })
      ),
    }),

    async execute(
      _toolCallId,
      params,
      _signal,
      _onUpdate,
      ctx: ExtensionContext
    ) {
      const infoType = params.info ?? "all";
      const result: Record<string, unknown> = {};

      if (infoType === "model" || infoType === "all") {
        const model = ctx.model;
        const modelRegistry = ctx.modelRegistry;

        result.model = {
          current: model
            ? {
                id: model.id,
                name: model.name,
                provider: model.provider,
                contextWindow: model.contextWindow,
                maxTokens: model.maxTokens,
                reasoning: model.reasoning,
                supportsThinking: (model as any).supportsThinking,
                inputTypes: model.input,
                cost: model.cost,
              }
            : null,
          thinkingLevel: pi.getThinkingLevel?.(),
          allAvailable: modelRegistry.getAll().map((m) => ({
            id: m.id,
            name: m.name,
            provider: m.provider,
          })),
        };
      }

      if (infoType === "session" || infoType === "all") {
        const sessionManager = ctx.sessionManager;
        const entries = sessionManager.getEntries();
        const branch = sessionManager.getBranch();

        // Get timestamps for first and last messages
        const timestamps = entries
          .map((e) => e.timestamp)
          .filter((t): t is number => typeof t === "number");
        
        const firstTimestamp = timestamps.length > 0 ? Math.min(...timestamps) : null;
        const lastTimestamp = timestamps.length > 0 ? Math.max(...timestamps) : null;

        result.session = {
          title: getSessionTitle(pi, sessionManager),
          file: sessionManager.getSessionFile(),
          workingDirectory: ctx.cwd,
          totalEntries: entries.length,
          branchEntries: branch.length,
          currentLeafId: sessionManager.getLeafId(),
          firstMessageDate: firstTimestamp ? new Date(firstTimestamp).toISOString() : null,
          lastMessageDate: lastTimestamp ? new Date(lastTimestamp).toISOString() : null,
          labels: entries
            .filter((e) => sessionManager.getLabel(e.id))
            .map((e) => ({
              entryId: e.id,
              label: sessionManager.getLabel(e.id),
            })),
        };
      }

      if (infoType === "context" || infoType === "all") {
        result.context = ctx.getContextUsage?.() ?? null;
      }

      if (infoType === "all") {
        const activeTools = pi.getActiveTools?.() ?? [];
        const allTools = pi
          .getAllTools?.()
          ?.map((t) => ({ name: t.name, description: t.description })) ?? [];
        const commands = pi.getCommands?.() ?? [];

        // Discover installed extensions from disk
        const installed = discoverExtensions(ctx.cwd);

        result.extensions = {
          installed: installed.map((e) => ({
            name: e.name,
            ...(e.description ? { description: e.description } : {}),
          })),
          activeTools,
          allTools,
          commands,
        };
      }

      const textContent = formatResult(result, infoType);

      return {
        content: [{ type: "text", text: textContent }],
        details: result,
      };
    },
  });

  // Register the /self command
  pi.registerCommand("self", {
    description: "Display current session and model information",
    handler: async (_args, ctx) => {
      const model = ctx.model;
      const usage = ctx.getContextUsage?.();
      const sessionManager = ctx.sessionManager;
      const entries = sessionManager.getEntries();
      
      // Get timestamps for first and last messages
      const timestamps = entries
        .map((e) => e.timestamp)
        .filter((t): t is number => typeof t === "number");
      
      const firstTimestamp = timestamps.length > 0 ? Math.min(...timestamps) : null;
      const lastTimestamp = timestamps.length > 0 ? Math.max(...timestamps) : null;
      
      const title = getSessionTitle(pi, sessionManager);
      const installed = discoverExtensions(ctx.cwd);

      let message = "";
      
      // Always show title line
      message += `**Title**: ${title ?? "(untitled - use /name to set)"}\n\n`;
      
      message += `**Model**: ${model?.name ?? "Unknown"} (${model?.provider ?? "?"}/${model?.id ?? "?"})\n`;
      message += `**Thinking Level**: ${pi.getThinkingLevel?.() ?? "off"}\n`;
      message += `**Context**: ${usage ? `${usage.tokens?.toLocaleString() ?? "?"} tokens (${usage.percent?.toFixed(1) ?? "?"}%)` : "unknown"}\n`;
      message += `**Working Directory**: ${ctx.cwd}\n`;
      message += `**Session File**: ${sessionManager.getSessionFile() ?? "ephemeral"}\n`;
      message += `**Entries**: ${entries.length} total\n`;
      
      if (firstTimestamp) {
        message += `**First Message**: ${new Date(firstTimestamp).toLocaleString()}\n`;
      }
      if (lastTimestamp) {
        message += `**Last Message**: ${new Date(lastTimestamp).toLocaleString()}\n`;
      }

      if (installed.length > 0) {
        message += `\n**Extensions** (${installed.length}):\n`;
        for (const ext of installed) {
          message += `  - ${ext.name}${ext.description ? `: ${ext.description}` : ""}\n`;
        }
      }

      ctx.ui.notify(message, "info");
    },
  });
}

function formatResult(result: Record<string, unknown>, infoType: string): string {
  const lines: string[] = [];

  if (infoType === "model" || infoType === "all") {
    const modelInfo = result.model as Record<string, unknown> | null;
    if (modelInfo?.current) {
      const current = modelInfo.current as Record<string, unknown>;
      lines.push("**Current Model:**");
      lines.push(`  Name: ${current.name}`);
      lines.push(`  ID: ${current.provider}/${current.id}`);
      lines.push(`  Context Window: ${current.contextWindow?.toLocaleString()} tokens`);
      lines.push(`  Max Output: ${current.maxTokens?.toLocaleString()} tokens`);
      lines.push(`  Reasoning: ${current.reasoning ? "yes" : "no"}`);
      lines.push(`  Thinking Level: ${modelInfo.thinkingLevel ?? "off"}`);
      lines.push("");
    }
  }

  if (infoType === "session" || infoType === "all") {
    const sessionInfo = result.session as Record<string, unknown> | null;
    if (sessionInfo) {
      lines.push("**Session:**");
      lines.push(`  Title: ${sessionInfo.title ?? "(untitled)"}`);
      lines.push(`  File: ${sessionInfo.file ?? "ephemeral"}`);
      lines.push(`  Working Directory: ${sessionInfo.workingDirectory}`);
      lines.push(`  Total Entries: ${sessionInfo.totalEntries}`);
      lines.push(`  Current Branch: ${sessionInfo.branchEntries} entries`);
      if (sessionInfo.firstMessageDate) {
        lines.push(`  First Message: ${sessionInfo.firstMessageDate}`);
      }
      if (sessionInfo.lastMessageDate) {
        lines.push(`  Last Message: ${sessionInfo.lastMessageDate}`);
      }
      lines.push("");
    }
  }

  if (infoType === "context" || infoType === "all") {
    const contextInfo = result.context as Record<string, unknown> | null;
    if (contextInfo) {
      lines.push("**Context Usage:**");
      lines.push(`  Tokens: ${contextInfo.tokens?.toLocaleString() ?? "unknown"}`);
      const pct = contextInfo.percent;
      lines.push(`  Percentage: ${typeof pct === "number" ? pct.toFixed(1) + "%" : "unknown"}`);
      lines.push("");
    } else if (infoType === "context") {
      lines.push("Context usage information not available.");
    }
  }

  if (infoType === "all") {
    const extInfo = result.extensions as Record<string, unknown> | null;
    if (extInfo) {
      // Show installed extensions
      const installed = extInfo.installed as { name: string; description?: string }[];
      if (installed && installed.length > 0) {
        lines.push(`**Extensions (${installed.length}):**`);
        for (const ext of installed) {
          lines.push(`  - ${ext.name}${ext.description ? ` -- ${ext.description}` : ""}`);
        }
        lines.push("");
      }

      const activeTools = extInfo.activeTools as string[];
      lines.push("**Active Tools:**");
      lines.push(`  ${activeTools.join(", ")}`);
      lines.push("");
    }
  }

  return lines.join("\n");
}

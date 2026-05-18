/**
 * pi-kyz — Automatic secret injection and scrubbing for pi agent sessions.
 *
 * Features:
 * 1. Bash env injection — overrides built-in bash tool, injects vault secrets as env vars
 * 2. Output scrubbing — scrubs secret values from ALL tool output (bash, read, grep, etc.)
 * 3. System prompt injection — adds available secret names so LLM knows to use $SECRET_NAME
 * 4. User bash injection — injects secrets into ! commands too
 * 5. /kyz command — lists secret names (never values)
 * 6. /kyz-set command — set a secret from within pi session
 * 7. /kyz-scope command — limit which secrets are injected by tag
 * 8. Tag-based scoping — only inject secrets matching specified tags
 * 9. Audit events — log tool_call events to kyz's audit log
 *
 * Integration: CLI only — shells out to `kyz` binary on PATH.
 *
 * Install:
 *   Add to pi config extensions: ["path/to/pi-agent-extensions/pi-kyz"]
 */

import { execFileSync, execSync } from "node:child_process";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { createBashTool, createLocalBashOperations } from "@earendil-works/pi-coding-agent";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SecretSummary {
	key: string;
	service: string;
	field_names: string[];
	tags: string[];
	updated_at: number;
}

interface SecretEntry {
	service: string;
	key: string;
	fields: Record<string, string>;
}

interface CachedSecrets {
	/** Flat list of { name, value } for env injection and scrubbing. */
	entries: Array<{ name: string; value: string }>;
	/** Timestamp when cache was last refreshed. */
	refreshedAt: number;
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/** Cache TTL in milliseconds (5 minutes). */
const CACHE_TTL_MS = 5 * 60 * 1000;

/** Active tag scope — when set, only secrets with matching tags are injected. */
let activeTagScope: string[] = [];

// ---------------------------------------------------------------------------
// kyz CLI helpers
// ---------------------------------------------------------------------------

function kyzAvailable(): boolean {
	try {
		execSync("kyz vault status --json", {
			timeout: 5000,
			stdio: ["pipe", "pipe", "pipe"],
		});
		return true;
	} catch {
		return false;
	}
}

function kyzVaultUnlocked(): boolean {
	try {
		const out = execSync("kyz vault status --json", {
			timeout: 5000,
			encoding: "utf-8",
			stdio: ["pipe", "pipe", "pipe"],
		});
		const status = JSON.parse(out);
		return status.unlocked === true;
	} catch {
		return false;
	}
}

function kyzListAllSecrets(): SecretSummary[] {
	try {
		// List all services first
		const servicesOut = execSync("kyz list --json", {
			timeout: 5000,
			encoding: "utf-8",
			stdio: ["pipe", "pipe", "pipe"],
		});
		const defaultEntries = JSON.parse(servicesOut).entries ?? [];

		// TODO: if we need cross-service listing, iterate services
		return defaultEntries as SecretSummary[];
	} catch {
		return [];
	}
}

function kyzGetSecret(service: string, key: string): SecretEntry | null {
	try {
		const out = execFileSync("kyz", ["get", "--json", "--service", service, key], {
			timeout: 5000,
			encoding: "utf-8",
			stdio: ["pipe", "pipe", "pipe"],
		});
		return JSON.parse(out) as SecretEntry;
	} catch {
		return null;
	}
}

function kyzSetSecret(service: string, key: string, value: string): boolean {
	try {
		execFileSync("kyz", ["set", "--service", service, key], {
			timeout: 5000,
			input: value,
			stdio: ["pipe", "pipe", "pipe"],
		});
		return true;
	} catch {
		return false;
	}
}

function kyzSetSecretFields(service: string, key: string, fields: Record<string, string>): boolean {
	try {
		const args = ["set", "--service", service, key];
		for (const [field, value] of Object.entries(fields)) {
			args.push("--field", `${field}=${value}`);
		}
		execFileSync("kyz", args, {
			timeout: 5000,
			stdio: ["pipe", "pipe", "pipe"],
		});
		return true;
	} catch {
		return false;
	}
}

function kyzExecWithSecrets(command: string): { ok: boolean; output: string } {
	try {
		const out = execFileSync("kyz", ["exec", "--", "bash", "-lc", command], {
			timeout: 120000,
			encoding: "utf-8",
			stdio: ["pipe", "pipe", "pipe"],
		});
		return { ok: true, output: out };
	} catch (err) {
		const msg = err instanceof Error ? err.message : "kyz exec failed";
		return { ok: false, output: msg };
	}
}

function kyzAudit(op: string, detail: string): void {
	try {
		// Use stderr-based audit logging via kyz exec dry-run (logs audit event)
		// For now, just log to stderr directly in kyz's format
		const ts = new Date().toISOString();
		process.stderr.write(`[kyz] ${ts} op=${op} detail=${detail}\n`);
	} catch {
		// Audit is best-effort
	}
}

// ---------------------------------------------------------------------------
// Secret loading and caching
// ---------------------------------------------------------------------------

let secretCache: CachedSecrets | null = null;

function loadSecrets(): CachedSecrets {
	// Return cached if fresh
	if (secretCache && Date.now() - secretCache.refreshedAt < CACHE_TTL_MS) {
		return secretCache;
	}

	if (!kyzAvailable() || !kyzVaultUnlocked()) {
		return { entries: [], refreshedAt: Date.now() };
	}

	const summaries = kyzListAllSecrets();
	const entries: Array<{ name: string; value: string }> = [];

	for (const summary of summaries) {
		// Apply tag scope filter
		if (activeTagScope.length > 0) {
			const tags = summary.tags ?? [];
			if (!activeTagScope.some((t) => tags.includes(t))) {
				continue;
			}
		}

		const entry = kyzGetSecret(summary.service, summary.key);
		if (!entry) continue;

		for (const [fieldName, fieldValue] of Object.entries(entry.fields)) {
			// Build env var name: SERVICE_KEY_FIELD (uppercased)
			// For single-value entries with field "value", just use SERVICE_KEY
			const envName =
				fieldName === "value"
					? `${entry.service}_${entry.key}`.toUpperCase().replace(/[^A-Z0-9]/g, "_")
					: `${entry.service}_${entry.key}_${fieldName}`.toUpperCase().replace(/[^A-Z0-9]/g, "_");

			entries.push({ name: envName, value: fieldValue });
		}
	}

	secretCache = { entries, refreshedAt: Date.now() };
	return secretCache;
}

function invalidateCache(): void {
	secretCache = null;
}

// ---------------------------------------------------------------------------
// Scrubbing
// ---------------------------------------------------------------------------

function scrubText(text: string, secrets: Array<{ name: string; value: string }>): string {
	if (secrets.length === 0) return text;

	let result = text;
	// Sort by value length descending to match longer secrets first
	const sorted = [...secrets].sort((a, b) => b.value.length - a.value.length);
	for (const secret of sorted) {
		if (secret.value.length < 4) continue;
		// Plain value
		result = result.replaceAll(secret.value, `[REDACTED:${secret.name}]`);
		// Base64-encoded variant
		const b64 = Buffer.from(secret.value).toString("base64");
		if (b64.length >= 4) {
			result = result.replaceAll(b64, `[REDACTED:${secret.name}:b64]`);
		}
		// URL-encoded variant
		const urlEncoded = encodeURIComponent(secret.value);
		if (urlEncoded !== secret.value && urlEncoded.length >= 4) {
			result = result.replaceAll(urlEncoded, `[REDACTED:${secret.name}:url]`);
		}
	}
	return result;
}

// ---------------------------------------------------------------------------
// Extension entry point
// ---------------------------------------------------------------------------

export default function (pi: ExtensionAPI) {
	const cwd = process.cwd();

	// Early exit if kyz is not available
	if (!kyzAvailable()) {
		return;
	}

	const bashTool = createBashTool(cwd);

	// -----------------------------------------------------------------------
	// Scrub secrets from all tool results
	// -----------------------------------------------------------------------
	pi.on("tool_result", async (event, _ctx) => {
		const { entries } = loadSecrets();
		if (entries.length === 0) return;

		const scrubbed = event.content.map((c) => (c.type === "text" ? { ...c, text: scrubText(c.text, entries) } : c));

		return { content: scrubbed };
	});

	// -----------------------------------------------------------------------
	// Override built-in bash to inject secrets as env vars
	// -----------------------------------------------------------------------
	pi.registerTool({
		...bashTool,
		description: `${bashTool.description}\n\nSecrets from kyz vault are automatically injected as environment variables.`,
		async execute(id, params, signal, onUpdate, _ctx) {
			const { entries } = loadSecrets();

			kyzAudit(
				"agent_bash",
				`cmd=${typeof params === "object" && params && "command" in params ? (params as { command: string }).command.slice(0, 100) : "?"}`
			);

			const injectedBash = createBashTool(cwd, {
				spawnHook: ({ command, cwd: spawnCwd, env }) => {
					const injectedEnv = { ...env };
					for (const secret of entries) {
						injectedEnv[secret.name] = secret.value;
					}
					return { command, cwd: spawnCwd, env: injectedEnv };
				},
			});

			return injectedBash.execute(id, params, signal, onUpdate);
		},
	});

	// -----------------------------------------------------------------------
	// Inject secrets into user ! commands too
	// -----------------------------------------------------------------------
	pi.on("user_bash", () => {
		const localOps = createLocalBashOperations();
		return {
			operations: {
				exec: async (
					command: string,
					execCwd: string,
					options: {
						onData: (data: Buffer) => void;
						signal?: AbortSignal;
						timeout?: number;
						env?: NodeJS.ProcessEnv;
					}
				) => {
					const { entries } = loadSecrets();
					const injectedEnv: Record<string, string> = {};
					for (const secret of entries) {
						injectedEnv[secret.name] = secret.value;
					}
					return localOps.exec(command, execCwd, {
						...options,
						env: { ...options.env, ...injectedEnv },
					});
				},
			},
		};
	});

	// -----------------------------------------------------------------------
	// Inject secret names into system prompt
	// -----------------------------------------------------------------------
	pi.on("before_agent_start", async (event) => {
		const { entries } = loadSecrets();
		if (entries.length === 0) return;

		const names = entries.map((s) => `$${s.name}`).join(", ");
		const tagInfo = activeTagScope.length > 0 ? `\nActive tag scope: ${activeTagScope.join(", ")}` : "";

		const instruction = [
			"\n## kyz — Secret Management",
			`Available secrets (injected as env vars in bash): ${names}`,
			"Use $SECRET_NAME in bash commands to reference secrets. Never ask the user for secret values.",
			"Secret values are automatically scrubbed from command output.",
			"Use /kyz to list available secrets. Use /kyz-scope tag:NAME to filter by tag.",
			tagInfo,
		].join("\n");

		return { systemPrompt: event.systemPrompt + instruction };
	});

	// -----------------------------------------------------------------------
	// Audit: log tool calls that may touch secrets
	// -----------------------------------------------------------------------
	pi.on("tool_execution_start", async (event) => {
		kyzAudit("tool_start", `tool=${event.toolName}`);
	});

	// -----------------------------------------------------------------------
	// /kyz command — list secret names (never values)
	// -----------------------------------------------------------------------
	pi.registerCommand("kyz", {
		description: "List kyz vault secrets (names only, never values)",
		handler: async (_args, ctx) => {
			if (!kyzVaultUnlocked()) {
				ctx.ui.notify("kyz vault is locked. Run 'kyz unlock' first.", "info");
				return;
			}

			const summaries = kyzListAllSecrets();
			if (summaries.length === 0) {
				ctx.ui.notify("No secrets found in kyz vault.", "info");
				return;
			}

			const scopeInfo = activeTagScope.length > 0 ? `\nActive scope: tags=[${activeTagScope.join(", ")}]` : "";

			const list = summaries
				.map((s) => {
					const tags = s.tags?.length ? ` [${s.tags.join(", ")}]` : "";
					return `  • ${s.service}/${s.key}  (${s.field_names.join(", ")})${tags}`;
				})
				.join("\n");

			ctx.ui.notify(`Vault secrets:${scopeInfo}\n${list}`, "info");
		},
	});

	// -----------------------------------------------------------------------
	// /kyz-set command — set a secret from within the session
	// -----------------------------------------------------------------------
	pi.registerCommand("kyz-set", {
		description: "Set a secret securely: /kyz-set service/key (value is prompted, never passed as command arg)",
		handler: async (args, ctx) => {
			if (!args) {
				ctx.ui.notify("Usage: /kyz-set service/key", "error");
				return;
			}

			const ref_ = args.trim();
			let value: string | undefined;

			const slashIdx = ref_.indexOf("/");
			if (slashIdx === -1) {
				ctx.ui.notify("Invalid reference. Use service/key format.", "error");
				return;
			}

			const service = ref_.slice(0, slashIdx);
			const key = ref_.slice(slashIdx + 1);

			value = (await ctx.ui.input(`Value for ${ref_} (sensitive):`)) ?? undefined;
			if (!value) {
				if (!value) {
					ctx.ui.notify("Cancelled", "info");
					return;
				}
			}

			if (kyzSetSecret(service, key, value)) {
				invalidateCache();
				kyzAudit("agent_set_secret", `secret=${ref_}`);
				ctx.ui.notify(`Secret ${ref_} saved`, "info");
			} else {
				ctx.ui.notify(`Failed to set secret ${ref_}`, "error");
			}
		},
	});

	// -----------------------------------------------------------------------
	// /kyz-set-fields command — set multi-field secret entries
	// -----------------------------------------------------------------------
	pi.registerCommand("kyz-set-fields", {
		description: "Set multi-field secret entry: /kyz-set-fields service/key",
		handler: async (args, ctx) => {
			if (!args) {
				ctx.ui.notify("Usage: /kyz-set-fields service/key", "error");
				return;
			}
			const ref_ = args.trim();
			const slashIdx = ref_.indexOf("/");
			if (slashIdx === -1) {
				ctx.ui.notify("Invalid reference. Use service/key format.", "error");
				return;
			}
			const service = ref_.slice(0, slashIdx);
			const key = ref_.slice(slashIdx + 1);
			const fieldsRaw = (await ctx.ui.input("Field names (comma separated, e.g. username,password,api_key):")) ?? "";
			const fieldNames = fieldsRaw
				.split(",")
				.map((s) => s.trim())
				.filter(Boolean);
			if (fieldNames.length === 0) {
				ctx.ui.notify("No fields provided", "error");
				return;
			}
			const fields: Record<string, string> = {};
			for (const name of fieldNames) {
				const val = (await ctx.ui.input(`Value for ${name} (sensitive):`)) ?? "";
				if (!val) {
					ctx.ui.notify(`Cancelled while capturing field ${name}`, "info");
					return;
				}
				fields[name] = val;
			}
			if (kyzSetSecretFields(service, key, fields)) {
				invalidateCache();
				kyzAudit("agent_set_secret_fields", `secret=${ref_} fields=${fieldNames.join(",")}`);
				ctx.ui.notify(`Secret ${ref_} saved with ${fieldNames.length} field(s)`, "info");
			} else {
				ctx.ui.notify(`Failed to set secret ${ref_}`, "error");
			}
		},
	});

	// -----------------------------------------------------------------------
	// /kyz-run command — execute command via kyz exec wrapper
	// -----------------------------------------------------------------------
	pi.registerCommand("kyz-run", {
		description: "Run a command with kyz-managed secret injection: /kyz-run <bash command>",
		handler: async (args, ctx) => {
			const cmd = args?.trim();
			if (!cmd) {
				ctx.ui.notify("Usage: /kyz-run <bash command>", "error");
				return;
			}
			const result = kyzExecWithSecrets(cmd);
			if (result.ok) {
				ctx.ui.notify(result.output || "Command completed", "info");
			} else {
				ctx.ui.notify(result.output || "kyz-run failed", "error");
			}
		},
	});

	// -----------------------------------------------------------------------
	// /kyz-scope command — limit injected secrets by tag
	// -----------------------------------------------------------------------
	pi.registerCommand("kyz-scope", {
		description: "Set tag scope for secret injection: /kyz-scope tag:aws tag:db (or 'clear' to remove scope)",
		handler: async (args, ctx) => {
			if (!args || args.trim() === "clear") {
				activeTagScope = [];
				invalidateCache();
				ctx.ui.notify("Tag scope cleared — all secrets will be injected.", "info");
				return;
			}

			const tags = args
				.split(/\s+/)
				.map((t) => t.replace(/^tag:/, "").trim())
				.filter(Boolean);

			if (tags.length === 0) {
				ctx.ui.notify("Usage: /kyz-scope tag:aws tag:db  (or 'clear')", "error");
				return;
			}

			activeTagScope = tags;
			invalidateCache();
			kyzAudit("agent_scope_change", `tags=${tags.join(",")}`);
			ctx.ui.notify(`Secret scope set to tags: ${tags.join(", ")}`, "info");
		},
	});

	// -----------------------------------------------------------------------
	// /kyz-reload command — force cache refresh
	// -----------------------------------------------------------------------
	pi.registerCommand("kyz-reload", {
		description: "Force reload of kyz secret cache",
		handler: async (_args, ctx) => {
			invalidateCache();
			const { entries } = loadSecrets();
			ctx.ui.notify(`Reloaded ${entries.length} secret(s) from kyz vault.`, "info");
		},
	});
}

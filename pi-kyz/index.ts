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
 *
 * Integration: CLI only — shells out to `kyz` binary on PATH.
 *
 * Install:
 *   Add to pi config extensions: ["path/to/pi-agent-extensions/pi-kyz"]
 */

import { execFileSync, execSync } from "node:child_process";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { createBashTool, createLocalBashOperations } from "@earendil-works/pi-coding-agent";
import { type SecretValue, scrubText, scrubValue } from "./scrub.js";
import { secretStream } from "./stream.js";

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

// ---------------------------------------------------------------------------
// Secret loading and caching
// ---------------------------------------------------------------------------

let secretCache: CachedSecrets | null = null;
// Scope changes/cache expiry affect injection, not redaction of in-flight results.
const knownSecrets: SecretValue[] = [];

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

	for (const entry of entries) {
		if (!knownSecrets.some((known) => known.value === entry.value)) knownSecrets.push(entry);
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

// Recursive JSON redaction lives in scrub.ts and is shared by the wrapper and hook.

// ---------------------------------------------------------------------------
// Extension entry point
// ---------------------------------------------------------------------------

export default function (pi: ExtensionAPI) {
	const cwd = process.cwd();
	const bashTool = createBashTool(cwd);

	// -----------------------------------------------------------------------
	// Scrub secrets from all tool results
	// -----------------------------------------------------------------------
	pi.on("tool_result", async (event, _ctx) => {
		if (knownSecrets.length === 0) return;
		return {
			content: event.content.map((c) => (c.type === "text" ? { ...c, text: scrubText(c.text, knownSecrets) } : c)),
			details: scrubValue(event.details, knownSecrets),
			...(event.structuredContent !== undefined
				? { structuredContent: scrubValue(event.structuredContent, knownSecrets) as typeof event.structuredContent }
				: {}),
		};
	});

	// -----------------------------------------------------------------------
	// Override built-in bash to inject secrets as env vars
	// -----------------------------------------------------------------------
	pi.registerTool({
		...bashTool,
		description: `${bashTool.description}\n\nSecrets from kyz vault are automatically injected as environment variables.`,
		async execute(id, params, signal, onUpdate, _ctx) {
			const { entries } = loadSecrets();

			const localOps = createLocalBashOperations();
			const injectedBash = createBashTool(cwd, {
				operations: {
					exec: async (command, execCwd, options) => {
						const stream = secretStream(knownSecrets, options.onData);
						try {
							return await localOps.exec(command, execCwd, { ...options, onData: stream.write });
						} finally {
							stream.end();
						}
					},
				},
				spawnHook: ({ command, cwd: spawnCwd, env }) => {
					const injectedEnv = { ...env };
					for (const secret of entries) {
						injectedEnv[secret.name] = secret.value;
					}
					return { command, cwd: spawnCwd, env: injectedEnv };
				},
			});

			try {
				const result = await injectedBash.execute(
					id,
					params,
					signal,
					onUpdate &&
						((update) =>
							onUpdate({
								...update,
								content: update.content.map((c) => (c.type === "text" ? { ...c, text: scrubText(c.text, knownSecrets) } : c)),
								details: scrubValue(update.details, knownSecrets) as typeof update.details,
								...(update.structuredContent !== undefined
									? { structuredContent: scrubValue(update.structuredContent, knownSecrets) as typeof update.structuredContent }
									: {}),
							}))
				);
				return {
					...result,
					content: result.content.map((c) => (c.type === "text" ? { ...c, text: scrubText(c.text, knownSecrets) } : c)),
					details: scrubValue(result.details, knownSecrets) as typeof result.details,
					...(result.structuredContent !== undefined
						? { structuredContent: scrubValue(result.structuredContent, knownSecrets) as typeof result.structuredContent }
						: {}),
				};
			} catch (error) {
				throw new Error(scrubText(error instanceof Error ? error.message : "Bash execution failed", knownSecrets));
			}
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
					const stream = secretStream(knownSecrets, options.onData);
					try {
						return await localOps.exec(command, execCwd, {
							...options,
							onData: stream.write,
							env: { ...options.env, ...injectedEnv },
						});
					} finally {
						stream.end();
					}
				},
			},
		};
	});

	// -----------------------------------------------------------------------
	// Inject secret names into system prompt
	// -----------------------------------------------------------------------
	pi.on("before_agent_start", async (event) => {
		const cachedEntries = secretCache && Date.now() - secretCache.refreshedAt < CACHE_TTL_MS ? secretCache.entries : [];

		// Never trigger vault IO on prompt send path.
		if (cachedEntries.length === 0) {
			return;
		}

		const names = cachedEntries.map((s) => `$${s.name}`).join(", ");
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

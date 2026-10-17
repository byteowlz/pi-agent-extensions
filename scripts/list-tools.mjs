#!/usr/bin/env node
/**
 * List every tool and sub-tool (action) the local extensions register in Pi,
 * using the installed Pi runtime as the authority.
 *
 * For each extension directory (pi-*\/index.ts) this spawns a real, isolated
 * `pi --mode rpc` process with a synthetic provider, then asks it for its tool
 * catalog via an in-process probe extension. Nothing real is loaded: no
 * credentials, no network, no session files, no store access.
 *
 * "Sub-tools" are discriminator parameters (an `action`/`mode`/`op` enum, or a
 * literal union) that expose several operations through one tool name.
 *
 * Usage:
 *   node scripts/list-tools.mjs [--json] [--binary /path/to/pi] [--grep NAME]
 *                              [--check] [--only pi-a,pi-b] [--all]
 *
 *   --json     Machine-readable envelope (stable shape) instead of a report.
 *   --binary   Pi binary to use (default: `pi` on PATH).
 *   --grep     Only show tools whose name/extension matches (case-insensitive).
 *   --check    Exit non-zero on naming/nesting findings (CI gate).
 *   --only     Comma-separated extension directory names to probe.
 *   --all      Probe all pi-*\/index.ts extensions (default) rather than only
 *              those with tool registrations detected by static scan.
 */
import { spawn } from "node:child_process";
import { constants, accessSync } from "node:fs";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** Resolve a bare command name on the ambient PATH so the isolated child (which
 * gets a minimal PATH) can still be executed by absolute path. */
function resolveBinary(name) {
	if (isAbsolute(name) || name.includes("/")) return name;
	for (const dir of (process.env.PATH ?? "").split(":")) {
		const candidate = join(dir, name);
		try {
			accessSync(candidate, constants.X_OK);
			return candidate;
		} catch {
			/* keep looking */
		}
	}
	return name;
}

function parseArgs(argv) {
	const options = { json: false, check: false, all: false, binary: "pi", grep: undefined, only: undefined };
	for (let index = 0; index < argv.length; index++) {
		const arg = argv[index];
		if (arg === "--json") options.json = true;
		else if (arg === "--check") options.check = true;
		else if (arg === "--all") options.all = true;
		else if (arg === "--binary") options.binary = argv[++index];
		else if (arg === "--grep") options.grep = argv[++index];
		else if (arg === "--only") options.only = argv[++index]?.split(",").filter(Boolean);
		else if (arg === "--help" || arg === "-h") options.help = true;
		else throw new Error(`Unknown argument: ${arg}`);
	}
	return options;
}

const HELP = `Usage: node scripts/list-tools.mjs [--json] [--binary PATH] [--grep NAME] [--check] [--only a,b] [--all]

List tools and sub-tools (action parameters) registered by the local extensions,
as reported by the installed Pi runtime (authoritative, isolated, offline).

  --json     machine-readable envelope
  --binary   pi binary (default: pi)
  --grep     filter by tool/extension name (case-insensitive)
  --check    exit 1 when naming/nesting findings exist
  --only     only probe these extension directories
  --all      probe all pi-* extensions, not just tool-registering ones
`;

/* ------------------------------------------------------------------ *
 * Static scan: which extensions register tools, and how (for labels).
 * ------------------------------------------------------------------ */

const REGISTER_RE = /pi\.registerTool\s*\(\s*\{/g;

async function extensionDirs() {
	const entries = await readdir(root, { withFileTypes: true });
	return entries
		.filter((entry) => entry.isDirectory() && entry.name.startsWith("pi-"))
		.map((entry) => entry.name)
		.sort();
}

async function scanExtension(name) {
	const indexPath = join(root, name, "index.ts");
	let source;
	try {
		source = await readFile(indexPath, "utf8");
	} catch {
		return { name, path: indexPath, hasIndex: false, registerCount: 0, static: [] };
	}
	// Collect the object literal following each pi.registerTool({ and pull the
	// top-level `name:`/`label:`/`exposure:`/`namespace:` string literals.
	const staticTools = [];
	REGISTER_RE.lastIndex = 0;
	for (const match of source.matchAll(REGISTER_RE)) {
		const body = sliceObject(source, match.index + match[0].length - 1);
		staticTools.push({
			name: literalField(body, "name"),
			label: literalField(body, "label"),
			exposure: literalField(body, "exposure"),
			namespace: literalField(body, "namespace"),
			hasPromptSnippet: /promptSnippet\s*:/.test(body),
		});
	}
	return { name, path: indexPath, hasIndex: true, registerCount: staticTools.length, static: staticTools };
}

/** Return the source text of the object literal starting at `open` (a "{" index). */
function sliceObject(source, open) {
	let depth = 0;
	let quote = null;
	let escaped = false;
	for (let index = open; index < source.length; index++) {
		const char = source[index];
		if (quote) {
			if (escaped) escaped = false;
			else if (char === "\\") escaped = true;
			else if (char === quote) quote = null;
			continue;
		}
		if (char === '"' || char === "'" || char === "`") quote = char;
		else if (char === "{") depth++;
		else if (char === "}") {
			depth--;
			if (depth === 0) return source.slice(open, index + 1);
		}
	}
	return source.slice(open);
}

/** First `key: "value"` (or `key: 'value'`) literal at the top level of a block. */
function literalField(body, key) {
	const marker = body.indexOf(`${key}:`);
	if (marker === -1) return undefined;
	// Reject matches that begin inside a longer identifier (e.g. `toolName:`).
	if (marker > 0 && /[A-Za-z0-9_$]/.test(body[marker - 1])) return undefined;
	// Only accept the first occurrence at nesting depth 1 (direct object field).
	if (depthAt(body, marker) !== 1) return undefined;
	const value = body.slice(marker + key.length).match(/^\s*:\s*(["'])((?:\\.|(?!\1).)*)\1/);
	return value ? value[2] : undefined;
}

/** Nesting depth of `index` in `body`, ignoring braces inside strings. */
function depthAt(body, index) {
	let depth = 0;
	let quote = null;
	let escaped = false;
	for (let cursor = 0; cursor < index; cursor++) {
		const char = body[cursor];
		if (quote) {
			if (escaped) escaped = false;
			else if (char === "\\") escaped = true;
			else if (char === quote) quote = null;
			continue;
		}
		if (char === '"' || char === "'" || char === "`") quote = char;
		else if (char === "{" || char === "(" || char === "[") depth++;
		else if (char === "}" || char === ")" || char === "]") depth--;
	}
	return depth;
}

/* ------------------------------------------------------------------ *
 * Runtime probe: authoritative tool metadata from the real Pi runtime.
 * ------------------------------------------------------------------ */

const PROBE_SOURCE = `export default function (pi) {
	pi.registerCommand("tool_catalog_probe", {
		description: "Synthetic tool-catalog probe (emits getAllTools over RPC status)",
		handler: (_args, ctx) => {
			const tools = pi.getAllTools().map((tool) => ({
				name: tool.name,
				description: tool.description,
				exposure: tool.exposure,
				namespace: tool.namespace?.name,
				annotations: tool.annotations,
				sourcePath: tool.sourceInfo?.path,
				active: pi.getActiveTools().includes(tool.name),
				parameters: tool.parameters,
				promptGuidelines: tool.promptGuidelines?.length ?? 0,
			}));
			const commands = pi.getCommands().map((command) => ({
				name: command.name,
				description: command.description,
				source: command.source,
				sourcePath: command.sourceInfo?.path,
			}));
			ctx.ui.setStatus("tool_catalog_probe", JSON.stringify({ tools, commands }));
		},
	});
}`;

async function probeExtension(binaryName, extensionPaths, home, project, cli) {
	const binary = resolveBinary(binaryName);
	const probe = join(home, "probe.ts");
	await writeFile(probe, PROBE_SOURCE);
	const args = [
		"--mode",
		"rpc",
		"--offline",
		"-ne",
		"-ns",
		"-np",
		"-nc",
		"-na",
		"--no-builtin-tools",
		"--no-session",
		"--provider",
		"catalog-fixture",
		"--model",
		"fixture",
	];
	for (const extensionPath of extensionPaths) args.push("-e", extensionPath);
	args.push("-e", probe);
	return new Promise((resolveResult) => {
		const child = spawn(binary, args, {
			cwd: project,
			env: {
				PATH: `${cli}:/usr/bin:/bin`,
				HOME: home,
				PI_CODING_AGENT_DIR: join(home, ".pi", "agent"),
				PI_OFFLINE: "1",
				XDG_CONFIG_HOME: join(home, ".config"),
				XDG_CACHE_HOME: join(home, ".cache"),
				XDG_DATA_HOME: join(home, ".local", "share"),
				XDG_RUNTIME_DIR: home,
			},
			stdio: ["pipe", "pipe", "pipe"],
		});
		let buffer = "";
		let payload;
		let stderr = "";
		let timedOut = false;
		const timer = setTimeout(() => {
			timedOut = true;
			child.kill("SIGKILL");
		}, 20000);
		child.stderr.on("data", (chunk) => {
			stderr += chunk.toString();
		});
		child.stdout.on("data", (chunk) => {
			buffer += chunk.toString();
			while (buffer.includes("\n")) {
				const boundary = buffer.indexOf("\n");
				const line = buffer.slice(0, boundary);
				buffer = buffer.slice(boundary + 1);
				if (!line.trim()) continue;
				let row;
				try {
					row = JSON.parse(line);
				} catch {
					continue;
				}
				if (row.statusKey === "tool_catalog_probe") {
					try {
						payload = JSON.parse(row.statusText);
					} catch {
						/* ignore malformed probe payload */
					}
					child.stdin.end();
				}
			}
		});
		child.on("error", (error) => {
			stderr += String(error);
		});
		child.on("close", (code) => {
			clearTimeout(timer);
			resolveResult({ code, timedOut, stderr, payload });
		});
		child.stdin.on("error", () => undefined);
		child.stdin.write(`${JSON.stringify({ type: "prompt", id: "probe", message: "/tool_catalog_probe" })}\n`);
	});
}

/* ------------------------------------------------------------------ *
 * Sub-tool extraction from a JSON schema.
 * ------------------------------------------------------------------ */

/** Find a discriminator property (action/mode/op/command) with an enum of strings. */
function discriminators(schema) {
	const found = [];
	const properties = schema?.properties ?? {};
	const names = Object.keys(properties).filter((key) => /^(action|mode|op|operation|command)$/i.test(key));
	for (const key of names) {
		const prop = properties[key];
		const values = stringEnum(prop);
		const required = Array.isArray(schema.required) && schema.required.includes(key);
		if (values && values.length > 1) found.push({ property: key, values, required, default: prop.default });
	}
	return found;
}

function stringEnum(prop) {
	if (!prop || typeof prop !== "object") return null;
	if (Array.isArray(prop.enum) && prop.enum.every((value) => typeof value === "string")) return prop.enum;
	// Union of literals: { anyOf: [{ const: "x" }, ...] } or type arrays.
	const variants = prop.anyOf ?? prop.oneOf;
	if (Array.isArray(variants)) {
		const values = variants.map((variant) => variant?.const).filter((value) => typeof value === "string");
		if (values.length === variants.length && values.length > 1) return values;
	}
	return null;
}

/* ------------------------------------------------------------------ *
 * Findings: naming and nesting heuristics.
 * ------------------------------------------------------------------ */

const SNAKE_CASE = /^[a-z][a-z0-9_]*$/;
const NAMESPACED = /^[a-z][a-z0-9]*(__|:)[a-z][a-z0-9_]*$/;
// Names of Pi's built-in tools; an extension registering one of these shadows it.
const BUILTIN_TOOL_NAMES = new Set(["read", "bash", "powershell", "edit", "write", "grep", "find", "ls"]);

function findingsFor(tool) {
	const findings = [];
	if (!SNAKE_CASE.test(tool.name) && !NAMESPACED.test(tool.name)) {
		findings.push({
			kind: "tool-name-not-snake-case",
			detail: `"${tool.name}" is not snake_case (or namespaced). Prefer a stable snake_case identifier.`,
		});
	}
	if (tool.namespace && !tool.name.includes("__")) {
		findings.push({
			kind: "namespace-without-prefix",
			detail: `tool declares namespace "${tool.namespace}" but its name is not prefixed (expected e.g. "${tool.namespace}__...").`,
		});
	}
	if (tool.subTools.length > 1 && !tool.subTools.some((sub) => sub.required)) {
		findings.push({
			kind: "sub-tool-discriminator-optional",
			detail: `exposes ${tool.subTools[0].property} ${JSON.stringify(tool.subTools[0].values)} but the discriminator is optional; a default is implied.`,
		});
	}
	if (tool.subTools.length > 1 && tool.promptSnippet === false) {
		findings.push({
			kind: "multi-action-without-snippet",
			detail: "has multiple sub-tools but no promptSnippet, so it is not summarized in Available tools.",
		});
	}
	if (tool.overridesBuiltin) {
		findings.push({
			kind: "overrides-builtin",
			detail: `re-registers builtin "${tool.name}"; the extension's registration shadows the builtin tool.`,
		});
	}
	return findings;
}

/* ------------------------------------------------------------------ *
 * Rendering
 * ------------------------------------------------------------------ */

function renderTool(tool) {
	const lines = [];
	const meta = [
		tool.exposure ? `exposure=${tool.exposure}` : "exposure=<default>",
		tool.namespace ? `namespace=${tool.namespace}` : null,
		tool.label ? `label=${tool.label}` : null,
		tool.annotations ? `annotations=${annotationSummary(tool.annotations)}` : null,
		tool.promptSnippet === false ? "no-promptSnippet" : null,
		tool.active ? "active" : "inactive",
	]
		.filter(Boolean)
		.join(" ");
	lines.push(`    ▸ ${tool.name} — ${meta}`);
	if (tool.description) lines.push(`        ${firstLine(tool.description)}`);
	for (const sub of tool.subTools) {
		const marker = sub.required ? "" : " (optional)";
		const fallback = sub.default !== undefined ? `, default=${JSON.stringify(sub.default)}` : "";
		lines.push(`        ↳ ${sub.property}${marker}: ${sub.values.join(" | ")}${fallback}`);
	}
	for (const finding of tool.findings) lines.push(`        ⚠ [${finding.kind}] ${finding.detail}`);
	return lines;
}

function renderText(envelope) {
	const lines = [];
	const { extensions, tools, builtins, commands, warnings } = envelope.data;
	lines.push(
		`Pi tool catalog — ${envelope.binary} (${tools.length} extension tools, ${builtins.length} builtins, ${commands.length} commands)`
	);
	lines.push("");
	for (const extension of extensions) {
		const own = tools.filter((tool) => tool.extension === extension.name);
		const ownCommands = commands.filter((command) => command.extension === extension.name);
		if (own.length === 0 && ownCommands.length === 0) continue;
		lines.push(`● ${extension.name} — ${own.length} tool(s), ${ownCommands.length} command(s)`);
		for (const tool of own) lines.push(...renderTool(tool));
		for (const command of ownCommands)
			lines.push(`    /${command.name}${command.description ? ` — ${firstLine(command.description)}` : ""}`);
	}
	if (warnings.length) {
		lines.push("", "Warnings:");
		for (const warning of warnings) lines.push(`  ! ${warning}`);
	}
	lines.push("");
	lines.push(`Built-in tools (${builtins.length}): ${builtins.map((tool) => tool.name).join(", ") || "(none)"}`);
	lines.push("", "Sub-tools (action-style tools):");
	const withSub = tools.filter((tool) => tool.subTools.length > 0);
	if (withSub.length === 0) lines.push("  (none)");
	for (const tool of withSub) {
		lines.push(
			`  ${tool.name} (${tool.extension}): ${tool.subTools.map((sub) => `${sub.property}=${sub.values.join("|")}`).join("; ")}`
		);
	}
	return lines.join("\n");
}

function firstLine(text) {
	const line =
		String(text)
			.split("\n")
			.find((entry) => entry.trim()) ?? "";
	return line.trim().slice(0, 120);
}

function annotationSummary(annotations) {
	const parts = [];
	if (annotations.readOnlyHint !== undefined) parts.push(`readOnly=${annotations.readOnlyHint}`);
	if (annotations.destructiveHint !== undefined) parts.push(`destructive=${annotations.destructiveHint}`);
	if (annotations.idempotentHint !== undefined) parts.push(`idempotent=${annotations.idempotentHint}`);
	if (annotations.openWorldHint !== undefined) parts.push(`openWorld=${annotations.openWorldHint}`);
	return parts.join(",") || "declared";
}

/* ------------------------------------------------------------------ *
 * Main
 * ------------------------------------------------------------------ */

async function buildSandbox(temp) {
	const home = join(temp, "home");
	const project = join(temp, "project");
	const cli = join(temp, "bin");
	await mkdir(join(home, ".pi", "agent"), { recursive: true });
	await mkdir(project, { recursive: true });
	await mkdir(cli, { recursive: true });
	// Keep the probe from ever reaching real services.
	for (const name of ["kyz", "mmry", "agntz", "herdr", "trx", "xlatch", "eavs", "hstry"]) {
		await writeFile(join(cli, name), "#!/bin/sh\nexit 127\n", { mode: 0o755 });
	}
	await writeFile(
		join(home, ".pi", "agent", "models.json"),
		JSON.stringify({
			providers: {
				"catalog-fixture": {
					baseUrl: "http://127.0.0.1:9/v1",
					api: "openai-completions",
					apiKey: "synthetic",
					models: [{ id: "fixture", input: ["text"], contextWindow: 4096, maxTokens: 256 }],
				},
			},
		})
	);
	return { home, project, cli };
}

/** Attribute runtime tools/commands to their owning extension by source path. */
function attributePayload(payload, candidates, warnings) {
	const extensions = [];
	const tools = [];
	const builtins = [];
	const commands = [];
	const byExtension = new Map(candidates.map((scan) => [join(root, scan.name), { tools: [], commands: [] }]));
	const ownerOf = (sourcePath) => [...byExtension.keys()].find((base) => sourcePath.startsWith(base));
	for (const tool of payload.tools ?? []) {
		const subTools = discriminators(tool.parameters ?? {}).map((sub) => ({ ...sub }));
		const sourcePath = tool.sourcePath ?? "";
		const owner = ownerOf(sourcePath);
		if (!owner || sourcePath.startsWith("builtin:")) {
			builtins.push({ name: tool.name, description: tool.description });
			continue;
		}
		const record = {
			name: tool.name,
			extension: owner.slice(root.length + 1),
			description: tool.description,
			exposure: tool.exposure,
			namespace: tool.namespace,
			annotations: tool.annotations,
			active: tool.active,
			promptSnippet: undefined,
			promptGuidelines: tool.promptGuidelines,
			sourcePath: tool.sourcePath,
			subTools,
		};
		tools.push(record);
		byExtension.get(owner).tools.push(tool.name);
	}
	for (const command of payload.commands ?? []) {
		if (command.source !== "extension" || command.name === "tool_catalog_probe") continue;
		const owner = ownerOf(command.sourcePath ?? "");
		if (!owner) continue;
		commands.push({
			name: command.name,
			extension: owner.slice(root.length + 1),
			description: command.description,
			sourcePath: command.sourcePath,
		});
		byExtension.get(owner).commands.push(command.name);
	}
	for (const scan of candidates) {
		const own = byExtension.get(join(root, scan.name));
		const missing = scan.static.filter((entry) => entry.name && !own.tools.includes(entry.name));
		extensions.push({
			name: scan.name,
			registerCount: scan.registerCount,
			toolCount: own.tools.length,
			commandCount: own.commands.length,
			registered: own.tools,
			staticNames: scan.static.map((entry) => entry.name).filter(Boolean),
			missing,
		});
		for (const entry of missing)
			warnings.push(`${scan.name}: static scan registered "${entry.name}" but the runtime did not report it`);
	}
	return { extensions, tools, builtins, commands };
}

async function collectCatalog(options, candidates, warnings) {
	const temp = await mkdtemp(join(tmpdir(), "pi-tool-catalog-"));
	const sandbox = await buildSandbox(temp);
	try {
		const result = await probeExtension(
			options.binary,
			candidates.map((scan) => join(root, scan.name, "index.ts")),
			sandbox.home,
			sandbox.project,
			sandbox.cli
		);
		if (result.payload) return attributePayload(result.payload, candidates, warnings);
		const extensions = candidates.map((scan) => ({
			name: scan.name,
			registerCount: scan.registerCount,
			toolCount: 0,
			commandCount: 0,
			error: result.timedOut ? "probe timed out" : `runtime probe returned no payload (exit ${result.code})`,
		}));
		const detail = result.stderr?.trim() ? `: ${result.stderr.trim().split("\n").slice(-3).join(" | ")}` : "";
		warnings.push(
			(result.timedOut ? "runtime probe timed out" : `runtime probe returned no payload (exit ${result.code})`) + detail
		);
		return { extensions, tools: [], builtins: [], commands: [] };
	} finally {
		await rm(temp, { recursive: true, force: true });
	}
}

/** Enrich runtime records with static-only fields and derive findings. */
function enrichCatalog(catalog, candidates, warnings) {
	const probeNames = new Map();
	for (const scan of candidates) {
		for (const entry of scan.static) if (entry.name) probeNames.set(entry.name, entry);
	}
	const builtinNames = new Set([...catalog.builtins.map((tool) => tool.name), ...BUILTIN_TOOL_NAMES]);
	for (const tool of catalog.tools) {
		const entry = probeNames.get(tool.name);
		if (entry) {
			tool.label = entry.label;
			tool.promptSnippet = entry.hasPromptSnippet;
		}
		if (builtinNames.has(tool.name)) tool.overridesBuiltin = true;
		tool.findings = findingsFor(tool);
	}
	const seen = new Map();
	for (const tool of catalog.tools) {
		const owners = seen.get(tool.name) ?? [];
		owners.push(tool.extension);
		seen.set(tool.name, owners);
	}
	for (const [name, owners] of seen) {
		if (owners.length > 1) warnings.push(`tool name "${name}" is registered by multiple extensions: ${owners.join(", ")}`);
	}
	for (const tool of catalog.tools) {
		const owners = seen.get(tool.name);
		if (owners && owners.length > 1) {
			tool.findings.push({
				kind: "duplicate-tool-name",
				detail: `"${tool.name}" is also registered by ${owners.filter((owner) => owner !== tool.extension).join(", ")}.`,
			});
		}
	}
}

function summarize(catalog) {
	return {
		extensions: catalog.extensions.filter((extension) => extension.toolCount + extension.commandCount > 0).length,
		tools: catalog.tools.length,
		subToolParents: catalog.tools.filter((tool) => tool.subTools.length > 0).length,
		commands: catalog.commands.length,
		builtins: catalog.builtins.length,
		findings: catalog.tools.reduce((sum, tool) => sum + tool.findings.length, 0),
	};
}

function applyGrep(data, grep) {
	const needle = grep.toLowerCase();
	data.tools = data.tools.filter(
		(tool) => tool.name.toLowerCase().includes(needle) || tool.extension.toLowerCase().includes(needle)
	);
	const names = new Set(data.tools.map((tool) => tool.extension));
	data.extensions = data.extensions.filter((extension) => names.has(extension.name));
	data.summary = summarize(data);
}

async function main() {
	const options = parseArgs(process.argv.slice(2));
	if (options.help) {
		process.stdout.write(HELP);
		return;
	}
	const scans = await Promise.all((await extensionDirs()).map((name) => scanExtension(name)));
	const candidates = scans.filter((scan) => {
		if (options.only) return options.only.includes(scan.name);
		if (options.all) return scan.hasIndex;
		return scan.registerCount > 0;
	});
	const warnings = [];
	if (candidates.length === 0) warnings.push("No extensions matched the selection.");

	const catalog = await collectCatalog(options, candidates, warnings);
	enrichCatalog(catalog, candidates, warnings);

	const payload = {
		version: 1,
		generatedAt: new Date().toISOString(),
		binary: options.binary,
		root,
		data: { ...catalog, warnings, summary: summarize(catalog) },
		ok: true,
	};
	if (options.grep) applyGrep(payload.data, options.grep);

	if (options.json) {
		process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
	} else {
		process.stdout.write(`${renderText({ ...payload, binary: options.binary })}\n`);
		const { tools, subToolParents, commands, builtins, findings } = payload.data.summary;
		process.stdout.write(
			`\nSummary: ${tools} extension tool(s), ${subToolParents} with sub-tools, ${commands} command(s), ${builtins} builtin(s), ${findings} finding(s).\n`
		);
	}
	if (options.check && payload.data.summary.findings > 0) process.exitCode = 1;
}

main().catch((error) => {
	process.stderr.write(`${error?.stack ?? error}\n`);
	process.exitCode = 1;
});

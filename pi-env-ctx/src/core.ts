import { arch, hostname, platform } from "node:os";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";

export const CTX_VERSION = "2";
export const HARNESS = "pi";

export const VAR_VERSION = "AGENT_CTX_VERSION";
export const VAR_HARNESS = "AGENT_CTX_HARNESS";
export const VAR_SESSION_ID = "AGENT_CTX_HARNESS_SESSION_ID";
export const VAR_MODEL = "AGENT_CTX_MODEL";
export const VAR_SESSION_NAME = "AGENT_CTX_SESSION_NAME";

// Multiplexer/agent bag (v2) — produced only when running inside herdr.
export const VAR_MULTIPLEXER = "AGENT_CTX_MULTIPLEXER";
export const VAR_AGENT_ID = "AGENT_CTX_AGENT_ID";
export const VAR_AGENT_ADDRESS = "AGENT_CTX_AGENT_ADDRESS";
export const VAR_WORKSPACE_ID = "AGENT_CTX_WORKSPACE_ID";

// Host bag (v2) — always produced (herdr-independent).
export const VAR_MACHINE_ID = "AGENT_CTX_MACHINE_ID";
export const VAR_NODE_HOSTNAME = "AGENT_CTX_NODE_HOSTNAME";
export const VAR_OS_ARCH = "AGENT_CTX_OS_ARCH";

export type EnvModel = {
	provider?: string;
	id?: string;
};

/**
 * Injectable view of the local host so unit tests don't touch the real
 * process/OS. Mirrors `os.hostname()`, `process.platform`, `process.arch`.
 */
export type HostModel = {
	hostname: () => string;
	platform: () => string;
	arch: () => string;
};

export const defaultHost: HostModel = {
	hostname,
	platform: () => platform(),
	arch: () => arch(),
};

function normalizeNonEmpty(value: string | undefined): string | undefined {
	if (typeof value !== "string") return undefined;
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : undefined;
}

export function setOrUnset(name: string, value: string | undefined, env: NodeJS.ProcessEnv = process.env): void {
	if (value) {
		env[name] = value;
		return;
	}
	delete env[name];
}

export function formatModel(model: EnvModel | undefined): string | undefined {
	if (!model) return undefined;
	const provider = normalizeNonEmpty(model.provider);
	const id = normalizeNonEmpty(model.id);
	if (!provider || !id) return undefined;
	return `${provider}/${id}`;
}

/**
 * Map Node's `process.arch` to the GOARCH-style arch used in `OS_ARCH`
 * (e.g. `x64` → `amd64`). Unknown arches pass through unchanged.
 */
export function formatOsArch(nodePlatform: string, nodeArch: string): string {
	const p = nodePlatform || "unknown";
	const a = nodeArch === "x64" ? "amd64" : nodeArch || "unknown";
	return `${p}/${a}`;
}

export function readSessionId(ctx: ExtensionContext): string | undefined {
	return normalizeNonEmpty(ctx.sessionManager.getSessionId?.());
}

export function readSessionName(ctx: ExtensionContext): string | undefined {
	return normalizeNonEmpty(ctx.sessionManager.getSessionName?.());
}

/**
 * Read herdr's own env (HERDR_*) as the source of truth for the
 * multiplexer/agent bag. The bag is emitted ONLY when HERDR_ENV === "1".
 *
 * AGENT_CTX_AGENT_ID = AGENT_CTX_AGENT_ADDRESS = $HERDR_PANE_ID (for now).
 * AGENT_LABEL is deliberately skipped this pass (needs an async socket call
 * to herdr for the tab/pane title).
 */
export function readHerdrLayer(env: NodeJS.ProcessEnv = process.env): void {
	const inHerdr = env.HERDR_ENV === "1";
	const paneId = inHerdr ? normalizeNonEmpty(env.HERDR_PANE_ID) : undefined;
	const workspaceId = inHerdr ? normalizeNonEmpty(env.HERDR_WORKSPACE_ID) : undefined;

	setOrUnset(VAR_MULTIPLEXER, inHerdr ? "herdr" : undefined, env);
	setOrUnset(VAR_AGENT_ID, paneId, env);
	setOrUnset(VAR_AGENT_ADDRESS, paneId, env);
	setOrUnset(VAR_WORKSPACE_ID, workspaceId, env);
}

/**
 * Read the host bag (herdr-independent, always emitted). MACHINE_ID defaults
 * to the hostname unless herdr exposes a suitable machine name.
 */
export function readHostLayer(env: NodeJS.ProcessEnv = process.env, host: HostModel = defaultHost): void {
	const machineId = normalizeNonEmpty(env.HERDR_MACHINE_NAME) ?? normalizeNonEmpty(host.hostname());
	setOrUnset(VAR_MACHINE_ID, machineId, env);
	setOrUnset(VAR_NODE_HOSTNAME, normalizeNonEmpty(host.hostname()), env);
	setOrUnset(VAR_OS_ARCH, formatOsArch(host.platform(), host.arch()), env);
}

export function exportAll(ctx: ExtensionContext, env: NodeJS.ProcessEnv = process.env, host: HostModel = defaultHost): void {
	env[VAR_VERSION] = CTX_VERSION;
	env[VAR_HARNESS] = HARNESS;
	setOrUnset(VAR_SESSION_ID, readSessionId(ctx), env);
	setOrUnset(VAR_MODEL, formatModel(ctx.model), env);
	setOrUnset(VAR_SESSION_NAME, readSessionName(ctx), env);
	readHerdrLayer(env);
	readHostLayer(env, host);
}

export function updateModel(model: EnvModel | undefined, env: NodeJS.ProcessEnv = process.env): void {
	setOrUnset(VAR_MODEL, formatModel(model), env);
}

export function updateSessionScope(ctx: ExtensionContext, env: NodeJS.ProcessEnv = process.env): void {
	setOrUnset(VAR_SESSION_ID, readSessionId(ctx), env);
	setOrUnset(VAR_SESSION_NAME, readSessionName(ctx), env);
}

/**
 * Refresh all mutable context fields from the latest Pi runtime view.
 * Useful right before a turn or tool activity so first writes carry fresh ctx.
 */
export function refreshFromContext(
	ctx: ExtensionContext,
	env: NodeJS.ProcessEnv = process.env,
	host: HostModel = defaultHost
): void {
	updateSessionScope(ctx, env);
	updateModel(ctx.model, env);
	readHerdrLayer(env);
	readHostLayer(env, host);
}

/**
 * Clear all vars owned by this extension.
 * Useful on session/runtime shutdown to avoid leaking stale metadata.
 */
export function clearOwned(env: NodeJS.ProcessEnv = process.env): void {
	delete env[VAR_VERSION];
	delete env[VAR_HARNESS];
	delete env[VAR_SESSION_ID];
	delete env[VAR_MODEL];
	delete env[VAR_SESSION_NAME];
	delete env[VAR_MULTIPLEXER];
	delete env[VAR_AGENT_ID];
	delete env[VAR_AGENT_ADDRESS];
	delete env[VAR_WORKSPACE_ID];
	delete env[VAR_MACHINE_ID];
	delete env[VAR_NODE_HOSTNAME];
	delete env[VAR_OS_ARCH];
}

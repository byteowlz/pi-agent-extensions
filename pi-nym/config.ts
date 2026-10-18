/**
 * Configuration for pi-nym.
 *
 * Searched in order (first match wins), matching the repo convention:
 *   1. ./pi-nym.json            (cwd)
 *   2. ./.pi/pi-nym.json        (project-local)
 *   3. ~/.pi/agent/pi-nym.json  (global)
 */

import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join } from "node:path";

export type BackupMode = "encrypted" | "keep" | "delete";
export type GuardMode = "confirm" | "warn" | "off";
export type NerScope = "auto" | "prose" | "lines" | "all";

export interface PiNymConfig {
	/** nym executable; default: `nym` on PATH, else the newest local build. */
	nymBinary?: string;
	/** nym redaction profiles added to `default` (see `nym profiles`). */
	profiles: string[];
	/** Run the local NER model (names, addresses). Disable for regex/identity only. */
	ner: boolean;
	nerScope: NerScope;
	/** Preselected backup choice in the menu. */
	defaultBackup: BackupMode;
	/** Encrypted backups; default `$XDG_DATA_HOME/pi-nym/backups`. */
	backupDir?: string;
	/** kyz entry holding the backup passphrase (created on first use). */
	kyzService: string;
	kyzKey: string;
	/** Before sending unredacted content to a non-local model. */
	guard: GuardMode;
	/** Providers treated as local in addition to loopback/private base URLs. */
	localProviders: string[];
	/** Maximum time for one nym run. */
	timeoutMs: number;
}

export const DEFAULTS: PiNymConfig = {
	profiles: [],
	ner: true,
	nerScope: "auto",
	defaultBackup: "encrypted",
	kyzService: "pi-nym",
	kyzKey: "backup",
	guard: "confirm",
	localProviders: ["ollama", "lmstudio", "llamacpp", "llama.cpp", "vllm-local"],
	timeoutMs: 10 * 60 * 1000,
};

const CONFIG_NAME = "pi-nym.json";

export function configPaths(cwd: string): string[] {
	return [join(cwd, CONFIG_NAME), join(cwd, ".pi", CONFIG_NAME), join(homedir(), ".pi", "agent", CONFIG_NAME)];
}

const BACKUP_MODES: BackupMode[] = ["encrypted", "keep", "delete"];
const GUARD_MODES: GuardMode[] = ["confirm", "warn", "off"];
const SCOPES: NerScope[] = ["auto", "prose", "lines", "all"];

function pick<T extends string>(value: unknown, allowed: T[], fallback: T): T {
	return typeof value === "string" && (allowed as string[]).includes(value) ? (value as T) : fallback;
}

function strings(value: unknown, fallback: string[]): string[] {
	return Array.isArray(value) && value.every((v) => typeof v === "string") ? value : fallback;
}

export function parseConfig(raw: Record<string, unknown>): PiNymConfig {
	return {
		nymBinary: typeof raw.nymBinary === "string" ? raw.nymBinary : undefined,
		profiles: strings(raw.profiles, DEFAULTS.profiles),
		ner: typeof raw.ner === "boolean" ? raw.ner : DEFAULTS.ner,
		nerScope: pick(raw.nerScope, SCOPES, DEFAULTS.nerScope),
		defaultBackup: pick(raw.defaultBackup, BACKUP_MODES, DEFAULTS.defaultBackup),
		backupDir: typeof raw.backupDir === "string" ? raw.backupDir : undefined,
		kyzService: typeof raw.kyzService === "string" ? raw.kyzService : DEFAULTS.kyzService,
		kyzKey: typeof raw.kyzKey === "string" ? raw.kyzKey : DEFAULTS.kyzKey,
		guard: pick(raw.guard, GUARD_MODES, DEFAULTS.guard),
		localProviders: strings(raw.localProviders, DEFAULTS.localProviders),
		timeoutMs: typeof raw.timeoutMs === "number" && raw.timeoutMs > 0 ? raw.timeoutMs : DEFAULTS.timeoutMs,
	};
}

export function loadConfig(cwd: string): PiNymConfig {
	for (const path of configPaths(cwd)) {
		if (!existsSync(path)) continue;
		try {
			return parseConfig(JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>);
		} catch {
			throw new Error(`pi-nym: ${path} is not valid JSON`);
		}
	}
	return { ...DEFAULTS };
}

/** XDG Base Directory Specification: only absolute values count. */
export function xdgHome(variable: string, fallback: string, env: NodeJS.ProcessEnv = process.env): string {
	const value = env[variable];
	return value && isAbsolute(value) ? value : join(env.HOME || homedir(), fallback);
}

export function backupDir(config: PiNymConfig, env: NodeJS.ProcessEnv = process.env): string {
	if (config.backupDir) return config.backupDir.replace(/^~(?=$|\/)/, env.HOME || homedir());
	return join(xdgHome("XDG_DATA_HOME", ".local/share", env), "pi-nym", "backups");
}

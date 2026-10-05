/**
 * Configuration loading and merging for observational memory.
 *
 * Reads from:
 * - Global: ~/.pi/agent/memory.json
 * - Project: .pi/memory.json (in cwd)
 *
 * Project config overrides global config (deep merge).
 */

import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { MemoryConfig, ObserverConfig, ReflectorConfig } from "./types.js";

const CONFIG_FILENAME = "memory.json";

const DEFAULT_OBSERVER: ObserverConfig = {
	provider: "openai",
	model: "gpt-5-nano",
	messageTokenThreshold: 30000,
	temperature: 0.3,
	maxOutputTokens: 100000,
};

const DEFAULT_REFLECTOR: ReflectorConfig = {
	provider: "openai",
	model: "gpt-5-nano",
	observationTokenThreshold: 40000,
	temperature: 0,
	maxOutputTokens: 100000,
};

/** Returns the default configuration when no memory.json exists. */
export function getDefaultConfig(): MemoryConfig {
	return {
		observer: { ...DEFAULT_OBSERVER },
		reflector: { ...DEFAULT_REFLECTOR },
	};
}

/** Read and parse a single memory.json file. Returns null if not found or invalid. */
function readConfigFile(path: string): Partial<MemoryConfig> | null {
	if (!existsSync(path)) return null;

	try {
		const content = readFileSync(path, "utf-8");
		return JSON.parse(content) as Partial<MemoryConfig>;
	} catch {
		return null;
	}
}

/** Deep merge two partial configs. b overrides a. */
function mergeConfigs(a: Partial<MemoryConfig>, b: Partial<MemoryConfig>): Partial<MemoryConfig> {
	const result: Partial<MemoryConfig> = { ...a };

	if (b.observer) {
		result.observer = {
			...(a.observer ?? DEFAULT_OBSERVER),
			...b.observer,
		};
	}

	if (b.reflector) {
		result.reflector = {
			...(a.reflector ?? DEFAULT_REFLECTOR),
			...b.reflector,
		};
	}

	return result;
}

/** Resolve a partial config into a full MemoryConfig with defaults. */
function resolveConfig(partial: Partial<MemoryConfig>): MemoryConfig {
	return {
		observer: {
			...DEFAULT_OBSERVER,
			...(partial.observer ?? {}),
		},
		reflector: {
			...DEFAULT_REFLECTOR,
			...(partial.reflector ?? {}),
		},
	};
}

/**
 * Load memory.json config from global and project-local locations.
 *
 * Returns null if no config file exists at either location.
 * Returns a resolved MemoryConfig if at least one file is found.
 */
export function loadMemoryConfig(cwd: string): MemoryConfig | null {
	const globalPath = join(homedir(), ".pi", "agent", CONFIG_FILENAME);
	const projectPath = join(cwd, ".pi", CONFIG_FILENAME);

	const globalConfig = readConfigFile(globalPath);
	const projectConfig = readConfigFile(projectPath);

	// No config files found at all
	if (!globalConfig && !projectConfig) return null;

	// Merge: global as base, project overrides
	let merged: Partial<MemoryConfig> = {};

	if (globalConfig) {
		merged = globalConfig;
	}

	if (projectConfig) {
		merged = mergeConfigs(merged, projectConfig);
	}

	return resolveConfig(merged);
}

/** Estimate token count from text using chars / 4 heuristic. */
export function estimateTokens(text: string): number {
	return Math.ceil(text.length / 4);
}

import { constants, closeSync, existsSync, fstatSync, openSync, readSync } from "node:fs";
import { join } from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";

export interface RewriteConfig {
	enabled: boolean;
	allowAI: boolean;
	allowExternalEditor: boolean;
}
export const DEFAULT_CONFIG: RewriteConfig = { enabled: true, allowAI: true, allowExternalEditor: true };

/** Preferences, not a sandbox. Malformed first-match config fails closed. */
export function loadConfig(cwd: string, agentDir = getAgentDir()): RewriteConfig {
	for (const path of [
		join(cwd, "conversation-edit.json"),
		join(cwd, ".pi", "conversation-edit.json"),
		join(agentDir, "conversation-edit.json"),
	]) {
		if (!existsSync(path)) continue;
		const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
		try {
			if (!fstatSync(fd).isFile()) throw new Error("conversation-edit.json must be a regular file.");
			const buffer = Buffer.alloc(4097);
			const length = readSync(fd, buffer, 0, buffer.length, 0);
			if (length > 4096) throw new Error("conversation-edit.json exceeds 4 KiB.");
			const value: unknown = JSON.parse(buffer.subarray(0, length).toString("utf8"));
			if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid conversation-edit.json.");
			const config = { ...DEFAULT_CONFIG };
			for (const [key, setting] of Object.entries(value)) {
				if (!(key === "enabled" || key === "allowAI" || key === "allowExternalEditor") || typeof setting !== "boolean")
					throw new Error(`Invalid conversation-edit.json setting: ${key}`);
				config[key] = setting;
			}
			return config;
		} finally {
			closeSync(fd);
		}
	}
	return { ...DEFAULT_CONFIG };
}

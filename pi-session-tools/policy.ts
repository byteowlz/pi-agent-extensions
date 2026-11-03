/**
 * Model allowlist matching, shared by the subagent tool and the pure permission
 * broker so policy is evaluated one way only.
 */

/** Convert a simple glob (e.g. "openai/*") to a RegExp. */
export function globToRegExp(pattern: string): RegExp {
	const escaped = pattern
		.replace(/[.+^${}()|[\]\\]/g, "\\$&")
		.replace(/\*/g, ".*")
		.replace(/\?/g, ".");
	return new RegExp(`^${escaped}$`);
}

/** Does `full` (e.g. "openai/gpt-5") match any of the given patterns? Empty = all allowed. */
export function allowedBy(patterns: string[], full: string): boolean {
	if (patterns.length === 0) return true;
	const provider = full.split("/")[0] ?? "";
	const bare = full.split("/").pop() ?? full;
	return patterns.some((p) => {
		const re = globToRegExp(p);
		return re.test(full) || re.test(bare) || re.test(`${provider}/*`);
	});
}

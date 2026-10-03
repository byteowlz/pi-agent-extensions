export interface SecretValue {
	name: string;
	value: string;
}

export function scrubText(text: string, secrets: readonly SecretValue[]): string {
	let result = text;
	for (const secret of [...secrets].sort((a, b) => b.value.length - a.value.length)) {
		if (!secret.value) continue;
		// Values and encodings, never secret names, are used as match material.
		for (const value of new Set([secret.value, Buffer.from(secret.value).toString("base64"), encodeURIComponent(secret.value)])) {
			result = result.replaceAll(value, "[REDACTED]");
		}
	}
	return result;
}

/** Scrub keys as well as values. Fail closed for non-JSON/cyclic/oversized metadata. */
export function scrubValue(value: unknown, secrets: readonly SecretValue[]): unknown {
	const ancestors = new Set<object>();
	let nodes = 0;
	function visit(input: unknown, depth: number): unknown {
		if (++nodes > 100_000 || depth > 64) return "[REDACTED:metadata-limit]";
		if (typeof input === "string") return scrubText(input, secrets);
		if (input === null || typeof input === "boolean") return input;
		if (typeof input === "number") return Number.isFinite(input) ? input : null;
		if (input === undefined) return undefined;
		if (typeof input !== "object" || ancestors.has(input)) return "[REDACTED:non-json]";
		ancestors.add(input);
		let result: unknown;
		if (Array.isArray(input)) result = input.map((item) => visit(item, depth + 1) ?? null);
		else {
			const record: Record<string, unknown> = Object.create(null);
			for (const [key, item] of Object.entries(input)) {
				const safe = visit(item, depth + 1);
				if (safe !== undefined) record[scrubText(key, secrets)] = safe;
			}
			result = record;
		}
		ancestors.delete(input);
		return result;
	}
	return visit(value, 0);
}

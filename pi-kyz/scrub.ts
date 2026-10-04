export interface SecretValue {
	name: string;
	value: string;
}

/** Supported wire representations; shared by stream and final scrubbing. Not arbitrary-encoding DLP. */
export function secretNeedles(secrets: readonly SecretValue[]): string[] {
	const needles = new Set<string>();
	for (const { value } of secrets) {
		if (!value) continue;
		needles.add(value);
		needles.add(Buffer.from(value).toString("base64"));
		// encodeURIComponent rejects lone surrogates; still redact raw/JSON representations.
		try {
			needles.add(encodeURIComponent(value));
		} catch {
			/* Not valid Unicode for URI encoding. */
		}
		let escaped = value;
		for (let depth = 0; depth < 3; depth++) {
			escaped = JSON.stringify(escaped).slice(1, -1);
			needles.add(escaped);
		}
	}
	return [...needles].sort((a, b) => b.length - a.length);
}

export function scrubText(text: string, secrets: readonly SecretValue[]): string {
	let result = text;
	for (const value of secretNeedles(secrets)) result = result.replaceAll(value, "[REDACTED]");
	return result;
}

/** Scrub keys as well as values. Fail closed for non-JSON/cyclic/oversized metadata. */
export function scrubValue(value: unknown, secrets: readonly SecretValue[]): unknown {
	const ancestors = new Set<object>();
	let nodes = 0;
	function visitRecord(input: object, depth: number): Record<string, unknown> {
		const record: Record<string, unknown> = Object.create(null);
		for (const [key, item] of Object.entries(input)) {
			const safe = visit(item, depth + 1);
			if (safe !== undefined) record[scrubText(key, secrets)] = safe;
		}
		return record;
	}
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
		else result = visitRecord(input, depth);
		ancestors.delete(input);
		return result;
	}
	return visit(value, 0);
}

import { StringDecoder } from "node:string_decoder";

/** Public receipt cap in UTF-8 bytes, including JSON framing. Never a store mutation. */
export const OUTPUT_BYTES = 32_000;
export function clipText(text: string, bytes: number): string {
	const buffer = Buffer.from(text);
	if (buffer.length <= bytes) return text;
	return new StringDecoder("utf8").write(buffer.subarray(0, Math.max(0, bytes)));
}
export function jsonBytes(value: unknown): number {
	return Buffer.byteLength(JSON.stringify(value));
}
/** Bound a string's JSON representation, not just its unescaped code units. */
export function fitText(text: string, bytes: number): string {
	let result = clipText(text, bytes);
	while (jsonBytes(result) - 2 > bytes) {
		result = clipText(result, Math.floor((Buffer.byteLength(result) * bytes) / (jsonBytes(result) - 2)));
	}
	return result;
}
/** Fit whole entries, preserving opaque identities. Caller advertises omissions. */
export function fitEntries<T>(entries: T[], envelope: unknown, limit = OUTPUT_BYTES): T[] {
	let used = jsonBytes(envelope);
	const kept: T[] = [];
	for (const entry of entries) {
		const bytes = jsonBytes(entry) + (kept.length ? 1 : 0);
		if (used + bytes > limit) break;
		kept.push(entry);
		used += bytes;
	}
	return kept;
}

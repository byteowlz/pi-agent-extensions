/**
 * Extract copy-worthy atoms (URLs, paths, env assignments, secrets/identifiers,
 * network endpoints) from chat text. Pure and side-effect free.
 *
 * Ordering and dedupe are deterministic so the picker and tests agree.
 */

export type GrabCategory = "url" | "path" | "env" | "secret" | "id" | "network";

export interface GrabItem {
	category: GrabCategory;
	/** Exact text to copy. Never truncated. */
	value: string;
	/** True for token/password-like values that previews should redact. */
	secret: boolean;
	/** 1-based message position, used to show the most recent first. */
	turn: number;
}

const URL_RE = /\b(?:https?|ftp|ssh|git|file):\/\/[^\s<>"'`]+/gi;
const PATH_RE = /(?:^|[\s([{"'`:=])((?:(?:~|\.{1,2})?\/|[A-Za-z0-9._-]+\/)[A-Za-z0-9._@%+-]+(?:\/[A-Za-z0-9._@%+-]+)*)/g;
const ENV_RE = /\b(?:export\s+)?([A-Z][A-Z0-9_]{2,})=(?:"([^"\n]*)"|'([^'\n]*)'|([^\s"'`;]+))/g;
const JWT_RE = /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g;
const PREFIXED_TOKEN_RE = /\b(?:sk|pk|rk|ghp|gho|ghu|ghs|ghr|glpat|gldt|xox[baprs]|AKIA|ASIA|AIza)[-_A-Za-z0-9]{12,}\b/g;
const BEARER_RE = /\bBearer\s+([A-Za-z0-9._~+/-]{20,}={0,2})/g;
const HEX_RE = /\b[0-9a-f]{32,}\b/gi;
const BASE64URL_RE =
	/\b(?=[A-Za-z0-9_-]{40,}\b)(?=[A-Za-z0-9_-]*[a-z])(?=[A-Za-z0-9_-]*[A-Z])(?=[A-Za-z0-9_-]*\d)[A-Za-z0-9_-]{40,}\b/g;
const UUID_RE = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;
const ISSUE_RE = /\b[a-z][a-z0-9]{1,11}-[a-z0-9]{4}\b/g;
const SHA_RE = /\b[0-9a-f]{7,40}\b/gi;
const IPV4_RE = /\b(?:\d{1,3}\.){3}\d{1,3}(?::\d{1,5})?\b/g;
const HOSTPORT_RE = /\b(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}:\d{2,5}\b/gi;

const SECRET_KEY_RE = /(TOKEN|SECRET|PASSWORD|PASSWD|APIKEY|API_KEY|ACCESS_KEY|PRIVATE_KEY|CREDENTIAL|AUTH)/;
const JWT_TEST = /^eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}$/;
const PREFIXED_TEST = /^(?:sk|pk|rk|ghp|gho|ghu|ghs|ghr|glpat|gldt|xox[baprs]|AKIA|ASIA|AIza)[-_A-Za-z0-9]{12,}$/;

function isSecretValue(value: string): boolean {
	if (JWT_TEST.test(value) || PREFIXED_TEST.test(value)) return true;
	if (/^[0-9a-f]{32,}$/i.test(value)) return false; // bare hash: identifier, not a secret
	return /[A-Za-z0-9_-]{40,}/.test(value);
}

/** Trim trailing punctuation that is almost always prose, not part of the URL. */
function trimUrl(value: string): string {
	let url = value;
	while (url.length > 1 && /[.,;:!?]$/.test(url)) url = url.slice(0, -1);
	// Drop an unbalanced closing paren/bracket.
	for (const [open, close] of [
		["(", ")"],
		["[", "]"],
		["{", "}"],
	] as const) {
		while (url.endsWith(close) && url.split(close).length > url.split(open).length) url = url.slice(0, -1);
	}
	return url;
}

function insideAny(index: number, ranges: ReadonlyArray<readonly [number, number]>): boolean {
	return ranges.some(([start, end]) => index >= start && index < end);
}

/** Extract a deterministic, deduplicated atom list from ordered chat messages. */
export function extractItems(messages: readonly string[]): GrabItem[] {
	const items: GrabItem[] = [];
	const seen = new Map<string, GrabItem>();
	const envValues = new Set<string>();
	const urlRanges = new Map<number, [number, number][]>();
	const add = (category: GrabCategory, raw: string, turn: number, secret = false): void => {
		const value = category === "url" ? trimUrl(raw.trim()) : raw.trim();
		if (!value) return;
		if (category !== "url" && category !== "id" && value.length < 3) return;
		const key = `${category}\u0000${value}`;
		const existing = seen.get(key);
		if (existing) {
			// Keep the newest occurrence so recency ordering stays meaningful.
			if (turn > existing.turn) existing.turn = turn;
			return;
		}
		const item: GrabItem = { category, value, secret, turn };
		seen.set(key, item);
		items.push(item);
	};

	messages.forEach((text, index) => {
		const turn = index + 1;
		const ranges: [number, number][] = [];
		for (const match of text.matchAll(URL_RE)) {
			if (match.index === undefined) continue;
			add("url", match[0], turn);
			ranges.push([match.index, match.index + match[0].length]);
		}
		urlRanges.set(index, ranges);
		const outsideUrl = (at: number): boolean => !insideAny(at, ranges);

		for (const match of text.matchAll(ENV_RE)) {
			if (match.index === undefined || !outsideUrl(match.index)) continue;
			const key = match[1] as string;
			const quoted = match[2] ?? match[3];
			// Unquoted values are prose-adjacent; drop trailing sentence punctuation.
			const value = quoted ?? (match[4] ?? "").replace(/[.,;:!?)\]}]+$/, "");
			if (value) envValues.add(value);
			add("env", `${key}=${value}`, turn, SECRET_KEY_RE.test(key) || isSecretValue(value));
		}
		for (const match of text.matchAll(PATH_RE)) {
			if (match.index === undefined || !outsideUrl(match.index)) continue;
			const value = match[1] as string;
			// Require a real file-ish shape: absolute, ~/ ./, or a dotted extension.
			const rooted = /^(?:\/|~\/|\.\/|\.\.\/)/.test(value);
			if (!rooted && !/\.[A-Za-z0-9]{1,8}$/.test(value)) continue;
			add("path", value, turn);
		}
		for (const [regex, secret] of [
			[JWT_RE, true],
			[PREFIXED_TOKEN_RE, true],
			[BEARER_RE, true],
			[HEX_RE, false],
			[BASE64URL_RE, true],
		] as const) {
			for (const match of text.matchAll(regex)) {
				if (match.index === undefined || !outsideUrl(match.index)) continue;
				const value = match[1] ?? match[0];
				// The value already appears inside an env assignment; one entry is enough.
				if (envValues.has(value)) continue;
				add("secret", value, turn, secret || isSecretValue(value));
			}
		}
		for (const match of text.matchAll(UUID_RE)) {
			if (match.index === undefined || !outsideUrl(match.index)) continue;
			add("id", match[0], turn);
		}
		for (const match of text.matchAll(ISSUE_RE)) {
			if (match.index === undefined || !outsideUrl(match.index)) continue;
			add("id", match[0], turn);
		}
		for (const match of text.matchAll(SHA_RE)) {
			if (match.index === undefined || !outsideUrl(match.index)) continue;
			add("id", match[0], turn);
		}
		for (const match of text.matchAll(IPV4_RE)) {
			if (match.index === undefined || !outsideUrl(match.index)) continue;
			add("network", match[0], turn);
		}
		for (const match of text.matchAll(HOSTPORT_RE)) {
			if (match.index === undefined || !outsideUrl(match.index)) continue;
			add("network", match[0], turn);
		}
	});

	// Most recent first; Array.sort is stable, so insertion order breaks ties.
	return items.sort((a, b) => b.turn - a.turn);
}

/** Short, copy-safe preview. Secrets are redacted unless the caller reveals them. */
export function previewItem(item: GrabItem, reveal = false): string {
	if (!item.secret || reveal) return item.value;
	const value = item.value;
	if (value.length <= 12) return "•".repeat(value.length);
	return `${value.slice(0, 4)}…${value.slice(-4)}`;
}

export const CATEGORY_ORDER: readonly GrabCategory[] = ["url", "path", "env", "secret", "id", "network"];

export const CATEGORY_LABEL: Record<GrabCategory, string> = {
	url: "URLs",
	path: "Paths",
	env: "Env",
	secret: "Tokens",
	id: "IDs",
	network: "Network",
};

import type { Model } from "@earendil-works/pi-ai";

export type NativeApi = "openai-completions" | "openai-responses" | "anthropic-messages";
export const unavailable = () => new Error("EAVS metadata unavailable or invalid; no inference attempted.");
export const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const identifier = (v: unknown): v is string =>
	typeof v === "string" && /^[A-Za-z0-9_.-]{1,128}$/.test(v) && v !== "." && v !== "..";
const text = (v: unknown): v is string =>
	typeof v === "string" &&
	v.length > 0 &&
	Buffer.byteLength(v) <= 512 &&
	Array.from(v).every((c) => {
		const code = c.charCodeAt(0);
		return code >= 32 && (code < 127 || code > 159);
	});

/** Only origin or the documented /v1 API base, never an arbitrary path rewrite. */
export function serverAddress(value: string): string {
	try {
		if (
			typeof value !== "string" ||
			value.length > 2048 ||
			Array.from(value).some((c) => c.charCodeAt(0) <= 32 || c.charCodeAt(0) === 127) ||
			value.includes("?") ||
			value.includes("#")
		)
			throw unavailable();
		const url = new URL(value);
		if (
			!["https:", "http:"].includes(url.protocol) ||
			url.username ||
			url.password ||
			url.search ||
			url.hash ||
			!["/", "/v1", "/v1/"].includes(url.pathname)
		)
			throw unavailable();
		return url.origin;
	} catch {
		throw new Error("EAVS requires an HTTP(S) origin or /v1 API base without credentials, query or fragment.");
	}
}

export function serverOrigin(value: string, allowHttpOrigins: readonly string[] = []): string {
	const origin = serverAddress(value);
	if (origin.startsWith("http:") && !allowHttpOrigins.includes(origin))
		throw new Error("EAVS HTTP requires an explicit exact-origin exception; use /login to approve it.");
	return origin;
}

export function scopedKey(value: unknown): string {
	if (typeof value !== "string" || !/^eavs-[A-Za-z0-9_-]{1,4096}$/.test(value))
		throw new Error("Enter an EAVS scoped virtual key, not an operator key or credential command.");
	return value;
}

function compat(value: unknown): NonNullable<Model<"openai-completions">["compat"]> {
	const out: Record<string, boolean | string> = {};
	if (!object(value)) return out;
	for (const key of [
		"supportsStore",
		"supportsDeveloperRole",
		"supportsReasoningEffort",
		"supportsUsageInStreaming",
		"supportsToolChoice",
		"supportsStrictMode",
		"supportsImagesInToolResults",
	])
		if (typeof value[key] === "boolean") out[key] = value[key];
	if (value.maxTokensField === "max_tokens" || value.maxTokensField === "max_completion_tokens")
		out.maxTokensField = value.maxTokensField;
	return out;
}

function modelCompat(api: NativeApi, provider: unknown, model: unknown) {
	if (api === "openai-completions") return { compat: { ...compat(provider), ...compat(model) } };
	// Models that reject budget thinking (e.g. Claude Sonnet 5.5): Pi then sends
	// adaptive thinking with an effort mapped from the thinking level.
	if (api === "anthropic-messages" && object(model) && model.forceAdaptiveThinking === true)
		return { compat: { forceAdaptiveThinking: true } };
	return {};
}

export type EavsModel = Model<NativeApi> & { eavsPricing?: "unknown"; eavsReasoningEfforts?: string[] };

const EFFORT_LEVELS = ["none", "off", "minimal", "low", "medium", "high", "xhigh", "max"];

/** Gateway-reported accepted reasoning efforts, or undefined if unusable.
 * Advisory metadata: malformed values are ignored, never fatal. */
function reasoningEfforts(value: unknown): string[] | undefined {
	if (!Array.isArray(value) || !value.length || value.length > 16) return;
	const efforts = value.filter((v): v is string => typeof v === "string" && EFFORT_LEVELS.includes(v));
	return efforts.length === value.length && efforts.some((v) => v !== "none" && v !== "off") ? efforts : undefined;
}

/** Hide Pi thinking levels the upstream rejects; expose xhigh and max only
 * when accepted. Pi clamps a hidden selection upward, like the gateway rewrite. */
function thinkingLevelMap(efforts: string[]): NonNullable<Model<NativeApi>["thinkingLevelMap"]> {
	const map: NonNullable<Model<NativeApi>["thinkingLevelMap"]> = {};
	for (const level of ["minimal", "low", "medium", "high"] as const) if (!efforts.includes(level)) map[level] = null;
	map.xhigh = efforts.includes("xhigh") ? "xhigh" : null;
	map.max = efforts.includes("max") ? "max" : null;
	return map;
}
const UNKNOWN_PRICE_SUFFIX = " [price unknown]";

export interface Projection {
	models: EavsModel[];
	skipped: number;
}

function priceLabel(model: EavsModel): string {
	return model.eavsPricing === "unknown" ? UNKNOWN_PRICE_SUFFIX : "";
}

/** Catalog API name -> Pi native API and path suffix under the base path. */
const ROUTES: Record<string, [NativeApi, string]> = {
	"openai-completions": ["openai-completions", "/chat/completions"],
	"openai-responses": ["openai-responses", "/responses"],
	"openai-codex-responses": ["openai-responses", "/responses"],
	"anthropic-messages": ["anthropic-messages", "/messages"],
};

/** The validated provider route; invalid provider metadata is fatal. */
function providerRoute(p: Record<string, unknown>): [NativeApi, string] {
	const route = typeof p.api === "string" && Object.hasOwn(ROUTES, p.api) ? ROUTES[p.api] : undefined;
	if (!route || p.operation !== "chat" || p.base_path !== `/${p.id}/v1` || p.request_path !== `${p.base_path}${route[1]}`)
		throw unavailable();
	return route;
}

/** A model's own native API route on a multi-format gateway, the provider
 * route when it declares none, or undefined when its declaration is invalid
 * (unknown API or a path outside the provider's base path). */
function ownRoute(m: Record<string, unknown>, fallback: [NativeApi, string], basePath: string): [NativeApi, string] | undefined {
	if (m.api === undefined && m.request_path === undefined) return fallback;
	const own = typeof m.api === "string" && Object.hasOwn(ROUTES, m.api) ? ROUTES[m.api] : undefined;
	return own && m.request_path === `${basePath}${own[1]}` ? own : undefined;
}

// Adapted from EAVS adapters/pi/provider-library.ts: same schema and native route
// allowlist. Missing prices do not exclude self-hosted models; invalid metadata does.
export function projectCatalog(origin: string, catalog: unknown, allowHttpOrigins: readonly string[] = []): Projection {
	if (
		serverOrigin(origin, allowHttpOrigins) !== origin ||
		!object(catalog) ||
		catalog.schema_version !== 1 ||
		catalog.scope !== "key-filtered-chat-candidates" ||
		!Array.isArray(catalog.providers) ||
		catalog.providers.length > 256
	)
		throw unavailable();
	const models: EavsModel[] = [];
	const seen = new Set<string>();
	let count = 0;
	let skipped = 0;
	for (const p of catalog.providers) {
		if (!object(p) || !identifier(p.id) || seen.has(p.id) || !Array.isArray(p.models)) throw unavailable();
		seen.add(p.id);
		const route = providerRoute(p);
		const ids = new Set<string>();
		for (const m of p.models) {
			if (++count > 4096 || !object(m) || !text(m.id) || !text(m.name) || ids.has(m.id)) throw unavailable();
			ids.add(m.id);
			const modelRoute = ownRoute(m, route, p.base_path as string);
			const projected = modelRoute && projectModel(m, modelRoute[0]);
			if (!projected) {
				skipped++;
				continue;
			}
			models.push({
				...projected,
				id: `${p.id}/${m.id}`,
				name: `${p.id}: ${m.name}${priceLabel(projected)}`,
				provider: "eavs",
				baseUrl: `${origin}${p.base_path}`,
				...modelCompat(modelRoute[0], modelRoute[0] === route[0] ? p.compat : undefined, m.compat),
			});
		}
	}
	if (!models.length && skipped) throw unavailable();
	return { models, skipped };
}

function modelCost(price: unknown): EavsModel["cost"] | undefined {
	// Pi requires numeric costs. Zero here is an accounting placeholder, NOT
	// a price estimate or gateway budget exemption; preserve unknown separately.
	if (price === null || price === undefined) return { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
	if (!object(price) || price.status !== "unverified_estimate" || price.unit !== "USD_per_million_tokens" || !object(price.rates))
		return;
	const { input, output, cache_read: cacheRead, cache_write: cacheWrite } = price.rates;
	if (![input, output, cacheRead, cacheWrite].every((v) => typeof v === "number" && Number.isFinite(v) && v >= 0)) return;
	return { input, output, cacheRead, cacheWrite } as EavsModel["cost"];
}

function projectModel(m: Record<string, unknown>, api: NativeApi): EavsModel | undefined {
	const cost = modelCost(m.pricing);
	if (!cost) return;
	const efforts = m.reasoning === true ? reasoningEfforts(m.reasoning_efforts) : undefined;
	if (
		typeof m.context_window !== "number" ||
		!Number.isInteger(m.context_window) ||
		m.context_window <= 0 ||
		m.context_window > 10_000_000 ||
		typeof m.max_tokens !== "number" ||
		!Number.isInteger(m.max_tokens) ||
		m.max_tokens <= 0 ||
		m.max_tokens > m.context_window ||
		typeof m.reasoning !== "boolean" ||
		!Array.isArray(m.input) ||
		!m.input.length ||
		m.input.some((v) => v !== "text" && v !== "image")
	)
		return;
	return {
		id: m.id as string,
		name: m.name as string,
		provider: "eavs",
		baseUrl: "",
		api,
		reasoning: m.reasoning,
		input: m.input,
		contextWindow: m.context_window,
		maxTokens: m.max_tokens,
		cost,
		...(m.pricing === null || m.pricing === undefined ? { eavsPricing: "unknown" as const } : {}),
		...(efforts ? { thinkingLevelMap: thinkingLevelMap(efforts), eavsReasoningEfforts: efforts } : {}),
	};
}

function restorePriceLabel(m: Record<string, unknown>, provider: string) {
	if (!object(m.cost) || (m.eavsPricing !== undefined && m.eavsPricing !== "unknown")) throw unavailable();
	const unknownPrice = m.eavsPricing === "unknown";
	if (unknownPrice && [m.cost.input, m.cost.output, m.cost.cacheRead, m.cost.cacheWrite].some((rate) => rate !== 0))
		throw unavailable();
	const label = typeof m.name === "string" ? m.name.replace(`${provider}: `, "") : undefined;
	const name = unknownPrice && label?.endsWith(UNKNOWN_PRICE_SUFFIX) ? label.slice(0, -UNKNOWN_PRICE_SUFFIX.length) : label;
	return { unknownPrice, name };
}

/** Revalidate persisted metadata instead of trusting cache URLs/headers. */
export function restoreCatalog(
	origin: string,
	cached: readonly unknown[],
	allowHttpOrigins: readonly string[] = []
): EavsModel[] {
	if (cached.length > 4096) throw unavailable();
	const providers = new Map<string, Record<string, unknown>>();
	for (const m of cached) {
		if (!object(m) || typeof m.id !== "string" || typeof m.baseUrl !== "string" || !object(m.cost)) throw unavailable();
		const slash = m.id.indexOf("/");
		const provider = m.id.slice(0, slash);
		const id = m.id.slice(slash + 1);
		if (slash < 1 || !identifier(provider) || m.provider !== "eavs" || m.baseUrl !== `${origin}/${provider}/v1`)
			throw unavailable();
		const suffix =
			m.api === "openai-completions"
				? "/chat/completions"
				: m.api === "openai-responses"
					? "/responses"
					: m.api === "anthropic-messages"
						? "/messages"
						: undefined;
		if (!suffix) throw unavailable();
		let p = providers.get(provider);
		if (!p) {
			p = {
				id: provider,
				api: m.api,
				operation: "chat",
				base_path: `/${provider}/v1`,
				request_path: `/${provider}/v1${suffix}`,
				models: [],
			};
			providers.set(provider, p);
		}
		const { unknownPrice, name } = restorePriceLabel(m, provider);
		(p.models as unknown[]).push({
			id,
			name,
			api: m.api,
			request_path: `/${provider}/v1${suffix}`,
			input: m.input,
			reasoning: m.reasoning,
			context_window: m.contextWindow,
			max_tokens: m.maxTokens,
			compat: m.compat,
			reasoning_efforts: m.eavsReasoningEfforts,
			pricing: unknownPrice
				? null
				: {
						status: "unverified_estimate",
						unit: "USD_per_million_tokens",
						rates: { input: m.cost.input, output: m.cost.output, cache_read: m.cost.cacheRead, cache_write: m.cost.cacheWrite },
					},
		});
	}
	return projectCatalog(
		origin,
		{ schema_version: 1, scope: "key-filtered-chat-candidates", providers: [...providers.values()] },
		allowHttpOrigins
	).models;
}

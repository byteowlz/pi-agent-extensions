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
export function serverOrigin(value: string): string {
	try {
		const url = new URL(value);
		if (
			url.protocol !== "https:" ||
			url.username ||
			url.password ||
			url.search ||
			url.hash ||
			!["/", "/v1", "/v1/"].includes(url.pathname)
		)
			throw unavailable();
		return url.origin;
	} catch {
		throw new Error("EAVS requires an HTTPS origin or /v1 API base without credentials, query or fragment.");
	}
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
	return api === "openai-completions" ? { compat: { ...compat(provider), ...compat(model) } } : {};
}

export interface Projection {
	models: Model<NativeApi>[];
	skipped: number;
}

// Adapted from EAVS adapters/pi/provider-library.ts: same schema, native route
// allowlist, pricing/capability skip policy. Vendored logic has no sibling dependency.
export function projectCatalog(origin: string, catalog: unknown): Projection {
	if (
		serverOrigin(origin) !== origin ||
		!object(catalog) ||
		catalog.schema_version !== 1 ||
		catalog.scope !== "key-filtered-chat-candidates" ||
		!Array.isArray(catalog.providers) ||
		catalog.providers.length > 256
	)
		throw unavailable();
	const models: Model<NativeApi>[] = [];
	const seen = new Set<string>();
	let count = 0;
	let skipped = 0;
	for (const p of catalog.providers) {
		if (!object(p) || !identifier(p.id) || seen.has(p.id) || !Array.isArray(p.models)) throw unavailable();
		seen.add(p.id);
		const routes: Record<string, [NativeApi, string]> = {
			"openai-completions": ["openai-completions", "/chat/completions"],
			"openai-responses": ["openai-responses", "/responses"],
			"openai-codex-responses": ["openai-responses", "/responses"],
			"anthropic-messages": ["anthropic-messages", "/messages"],
		};
		const route = typeof p.api === "string" && Object.hasOwn(routes, p.api) ? routes[p.api] : undefined;
		if (!route || p.operation !== "chat" || p.base_path !== `/${p.id}/v1` || p.request_path !== `${p.base_path}${route[1]}`)
			throw unavailable();
		const ids = new Set<string>();
		for (const m of p.models) {
			if (++count > 4096 || !object(m) || !text(m.id) || !text(m.name) || ids.has(m.id)) throw unavailable();
			ids.add(m.id);
			const projected = projectModel(m, route[0]);
			if (!projected) {
				skipped++;
				continue;
			}
			models.push({
				...projected,
				id: `${p.id}/${m.id}`,
				name: `${p.id}: ${m.name}`,
				provider: "eavs",
				baseUrl: `${origin}${p.base_path}`,
				...modelCompat(route[0], p.compat, m.compat),
			});
		}
	}
	if (!models.length && skipped) throw unavailable();
	return { models, skipped };
}

function projectModel(m: Record<string, unknown>, api: NativeApi): Model<NativeApi> | undefined {
	const price = m.pricing;
	if (!object(price) || price.status !== "unverified_estimate" || price.unit !== "USD_per_million_tokens" || !object(price.rates))
		return;
	const { input, output, cache_read: cacheRead, cache_write: cacheWrite } = price.rates;
	if (
		![input, output, cacheRead, cacheWrite].every((v) => typeof v === "number" && Number.isFinite(v) && v >= 0) ||
		typeof input !== "number" ||
		input <= 0 ||
		typeof output !== "number" ||
		output <= 0 ||
		typeof cacheRead !== "number" ||
		typeof cacheWrite !== "number"
	)
		return;
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
		cost: { input, output, cacheRead, cacheWrite },
	};
}

/** Revalidate persisted metadata instead of trusting cache URLs/headers. */
export function restoreCatalog(origin: string, cached: readonly unknown[]): Model<NativeApi>[] {
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
		if (p.api !== m.api) throw unavailable();
		(p.models as unknown[]).push({
			id,
			name: typeof m.name === "string" ? m.name.replace(`${provider}: `, "") : undefined,
			input: m.input,
			reasoning: m.reasoning,
			context_window: m.contextWindow,
			max_tokens: m.maxTokens,
			compat: m.compat,
			pricing: {
				status: "unverified_estimate",
				unit: "USD_per_million_tokens",
				rates: { input: m.cost.input, output: m.cost.output, cache_read: m.cost.cacheRead, cache_write: m.cost.cacheWrite },
			},
		});
	}
	return projectCatalog(origin, { schema_version: 1, scope: "key-filtered-chat-candidates", providers: [...providers.values()] })
		.models;
}

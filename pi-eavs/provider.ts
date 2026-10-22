import { createHash } from "node:crypto";
import {
	type ApiKeyCredential,
	type Credential,
	type Model,
	type Provider,
	type ProviderStreams,
	createProvider,
	lazyApi,
	lazyStream,
} from "@earendil-works/pi-ai";
import {
	type NativeApi,
	type Projection,
	projectCatalog,
	restoreCatalog,
	scopedKey,
	serverOrigin,
	unavailable,
} from "./catalog.js";
import { CatalogError, type CatalogFetch, fetchCatalog, secureFetch } from "./transport.js";

const implementations: Record<NativeApi, ProviderStreams> = {
	"openai-completions": lazyApi(() => import("@earendil-works/pi-ai/api/openai-completions")),
	"openai-responses": lazyApi(() => import("@earendil-works/pi-ai/api/openai-responses")),
	"anthropic-messages": lazyApi(() => import("@earendil-works/pi-ai/api/anthropic-messages")),
};

function connection(credential?: Credential) {
	if (credential?.type !== "api_key" || !credential.env?.EAVS_SERVER) return;
	try {
		const origin = serverOrigin(credential.env.EAVS_SERVER);
		const key = scopedKey(credential.key);
		const binding = `eavs-scope-v1:${createHash("sha256")
			.update(JSON.stringify([origin, key]))
			.digest("hex")}`;
		return { origin, key, binding };
	} catch {
		return;
	}
}

export interface EavsOptions {
	onAuthChange?: (configured: boolean) => void;
	fetchCatalog?: CatalogFetch;
	/** Dependency injection for offline dispatch tests, not runtime configuration. */
	apis?: Record<NativeApi, ProviderStreams>;
}

function project(origin: string, value: unknown): Projection {
	try {
		return projectCatalog(origin, value);
	} catch {
		throw new CatalogError("invalid");
	}
}

export function eavsProvider(options: EavsOptions = {}): Provider<NativeApi> {
	const fetchMetadata = options.fetchCatalog ?? fetchCatalog;
	const apis = options.apis ?? implementations;
	let models: Model<NativeApi>[] = [];
	let binding: string | undefined;
	let pending: { binding: string; projection: Projection } | undefined;
	const auth = {
		apiKey: {
			name: "EAVS scoped virtual key",
			async login(
				interaction: Parameters<NonNullable<NonNullable<Provider["auth"]["apiKey"]>["login"]>>[0]
			): Promise<ApiKeyCredential> {
				if (process.env.PI_OFFLINE !== undefined) throw new Error("EAVS login metadata validation is disabled by PI_OFFLINE.");
				try {
					interaction.notify({
						type: "info",
						message:
							"Use an EAVS scoped virtual key, never an operator/master key. Pi stores this key unencrypted in auth.json. One EAVS connection is saved; signing in replaces it.",
					});
					const origin = serverOrigin(
						(
							await interaction.prompt({
								type: "text",
								message: "EAVS server HTTPS URL (origin or /v1 API base)",
								signal: interaction.signal,
							})
						).trim()
					);
					interaction.signal.throwIfAborted();
					const key = scopedKey(
						await interaction.prompt({ type: "secret", message: "EAVS scoped virtual key", signal: interaction.signal })
					);
					interaction.signal.throwIfAborted();
					interaction.notify({
						type: "progress",
						message: "Validating scoped chat catalog metadata only; no probe or inference.",
					});
					const projection = project(origin, await fetchMetadata(origin, key, interaction.signal));
					interaction.signal.throwIfAborted();
					const credential: ApiKeyCredential = { type: "api_key", key, env: { EAVS_SERVER: origin } };
					const configured = connection(credential);
					if (!configured) throw unavailable();
					pending = { binding: configured.binding, projection };
					interaction.notify({
						type: "info",
						message: `Validated ${projection.models.length} chat models; skipped ${projection.skipped} incomplete models. Prices are unverified estimates, not settlement. Empty scope is valid. If Pi reports credential synchronization failure next, run /eavs-refresh for a safe diagnostic; local cache publication may have failed even though validation succeeded.`,
					});
					return credential;
				} catch (error) {
					throw error instanceof CatalogError ? error : unavailable();
				}
			},
			async check({ credential }: { credential?: ApiKeyCredential }) {
				const c = connection(credential);
				options.onAuthChange?.(!!c);
				return c ? { type: "api_key" as const, source: "EAVS scoped key" } : undefined;
			},
			async resolve({ credential }: { credential?: ApiKeyCredential }) {
				const c = connection(credential);
				options.onAuthChange?.(!!c);
				return c
					? {
							auth: { apiKey: c.key, headers: { Authorization: `Bearer ${c.key}` } },
							env: { EAVS_SERVER: c.origin },
							source: "EAVS scoped key",
						}
					: undefined;
			},
		},
	};

	// CreateProvider supplies native API dispatch without copying wire clients.
	const delegate = createProvider<NativeApi>({ id: "eavs", name: "EAVS", auth, models: [], api: apis });
	const guarded: Provider<NativeApi> = {
		...delegate,
		getModels: () => models,
		getAllModels: () => models,
		filterModels: (list, credential) => (connection(credential)?.binding === binding ? list : []),
		filterAllModels: (list, credential) => (connection(credential)?.binding === binding ? list : []),
		async refreshModels(context) {
			const c = connection(context.credential);
			if (!c) {
				options.onAuthChange?.(false);
				await context.publish({
					persist: null,
					update: () => {
						models = [];
						binding = undefined;
						pending = undefined;
					},
				});
				return;
			}
			try {
				let next: Model<NativeApi>[] | undefined;
				if (pending?.binding === c.binding) next = pending.projection.models;
				else if (context.allowNetwork && process.env.PI_OFFLINE === undefined)
					next = project(c.origin, await fetchMetadata(c.origin, c.key, context.signal)).models;
				else if (binding === c.binding) return;
				else if (context.stored?.etag === c.binding) next = restoreCatalog(c.origin, context.stored.models);
				if (!next) next = [];
				context.signal.throwIfAborted();
				const snapshot = next;
				await context.publish({
					persist: { models: snapshot, etag: c.binding },
					update: () => {
						models = snapshot;
						binding = c.binding;
						pending = undefined;
					},
				});
			} catch (error) {
				if (error instanceof CatalogError && error.kind === "transient" && binding === c.binding) throw error;
				// Fail closed on revocation or malformed metadata. A
				// cancelled generation cannot prune a newer publication (SDK guard).
				await context.publish({
					persist: null,
					update: () => {
						models = [];
						binding = undefined;
						pending = undefined;
					},
				});
				throw error instanceof CatalogError ? error : unavailable();
			}
		},
		stream(model, context, requestOptions) {
			return dispatch(
				model,
				(native, safeFetch) => delegate.stream(native, context, { ...requestOptions, fetch: safeFetch }),
				requestOptions?.apiKey
			);
		},
		streamSimple(model, context, requestOptions) {
			return dispatch(
				model,
				(native, safeFetch) => delegate.streamSimple(native, context, { ...requestOptions, fetch: safeFetch }),
				requestOptions?.apiKey
			);
		},
	};
	function dispatch(
		model: Model<NativeApi>,
		run: (native: Model<NativeApi>, safeFetch: typeof fetch) => ReturnType<Provider["streamSimple"]>,
		key?: string
	) {
		return lazyStream(model, async () => {
			const known = models.find((m) => m.id === model.id);
			if (!known || !key || model.baseUrl !== known.baseUrl || model.api !== known.api)
				throw new Error("EAVS model unavailable or route changed; refresh and select the model again.");
			const origin = new URL(known.baseUrl).origin;
			if (connection({ type: "api_key", key, env: { EAVS_SERVER: origin } })?.binding !== binding)
				throw new Error("EAVS connection changed; refresh or sign in again.");
			// Anthropic's installed SDK appends /v1/messages itself. Only this
			// validated catalog route loses its terminal /v1 at dispatch; never
			// normalize arbitrary caller URLs or change OpenAI API bases.
			const native = {
				...known,
				id: known.id.slice(known.id.indexOf("/") + 1),
				baseUrl: known.api === "anthropic-messages" ? known.baseUrl.slice(0, -3) : known.baseUrl,
			};
			let stream: ReturnType<Provider["streamSimple"]>;
			try {
				stream = run(native, secureFetch(origin));
			} catch {
				throw new Error("EAVS request setup failed.");
			}
			return (async function* () {
				try {
					for await (const event of stream) {
						if ("partial" in event) event.partial.model = model.id;
						if ("message" in event) event.message.model = model.id;
						if ("error" in event) {
							event.error.model = model.id;
							event.error.errorMessage = "EAVS request failed or cancelled.";
						}
						yield event;
					}
				} catch {
					throw new Error("EAVS request failed or cancelled.");
				}
			})();
		});
	}
	return guarded;
}

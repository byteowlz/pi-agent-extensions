import { join } from "node:path";
import { type ExtensionAPI, type ExtensionContext, getAgentDir, readStoredCredential } from "@earendil-works/pi-coding-agent";
import { serverAddress } from "./catalog.js";
import { HttpPolicy } from "./http-policy.js";
import { type CatalogSummary, type EavsOptions, eavsProvider } from "./provider.js";
import { RefreshLoop } from "./refresh-loop.js";
import { CatalogError } from "./transport.js";

function diagnostic(error: unknown): string {
	if (error instanceof CatalogError) {
		if (error.kind === "auth") return "Authorization denied: check scoped-key expiry and scope, then /login.";
		if (error.kind === "transient")
			return "Network/TLS or gateway unavailable: check HTTPS trust and connectivity; cached models are retained.";
		return "Catalog schema invalid: check gateway catalog compatibility; invalid scope is removed.";
	}
	return "Local state/publication failure: check Pi auth and models-store file integrity/permissions and persisted EAVS_SERVER. A malformed models-store.json can block login and refresh. Back up privately; request consent before quarantining it. Do not delete auth.json or models.json.";
}

/** Non-EAVS providers whose models target the EAVS gateway origin directly.
 * Such hand-written entries skip catalog routing and can hit the gateway's
 * model-name provider heuristics; only provider names are returned. */
export function directGatewayProviders(models: readonly { provider: string; baseUrl: string }[], origin: string): string[] {
	const names = new Set<string>();
	for (const model of models) {
		if (model.provider === "eavs") continue;
		try {
			if (new URL(model.baseUrl).origin === origin) names.add(model.provider);
		} catch {
			/* Not a URL; nothing to compare. */
		}
	}
	return [...names].sort();
}

function warnDirectGatewayEntries(ctx: ExtensionContext, origin: string | undefined) {
	if (!origin || typeof ctx.modelRegistry?.getAll !== "function") return;
	const names = directGatewayProviders(ctx.modelRegistry.getAll(), origin);
	if (!names.length) return;
	ctx.ui.notify(
		`models.json provider(s) ${names.join(", ")} call the EAVS gateway directly and bypass its catalog routing, so requests can reach the wrong upstream. Remove them; /login → EAVS with the bare server URL discovers every provider and pins each route.`,
		"warning"
	);
}

export default async function (pi: ExtensionAPI) {
	return initializeEavs(pi);
}

export async function initializeEavs(
	pi: ExtensionAPI,
	options: EavsOptions = {},
	readCredential: typeof readStoredCredential = readStoredCredential
) {
	const httpPolicy = options.httpPolicy ?? new HttpPolicy(join(getAgentDir(), "pi-eavs.json"));
	let context: ExtensionContext | undefined;
	const catalogState: { summary?: CatalogSummary } = {};
	const offline = () => process.env.PI_OFFLINE !== undefined;
	const loop = new RefreshLoop(async (signal) => {
		if (!context || offline()) return { failed: false, configured: false };
		if (typeof context.modelRegistry.getProviderAuth !== "function" || typeof context.modelRegistry.refresh !== "function")
			return {
				failed: true,
				configured: true,
				diagnostic: "SDK compatibility: update Pi to a native-provider runtime exposing registry getProviderAuth and refresh.",
			};
		try {
			const auth = await context.modelRegistry.getProviderAuth("eavs");
			if (!auth || signal.aborted) return { failed: false, configured: false };
			const result = await context.modelRegistry.refresh({ providers: ["eavs"], force: true, allowNetwork: true, signal });
			const error = result.errors.get("eavs");
			return { failed: result.aborted || !!error, configured: true, diagnostic: error ? diagnostic(error) : undefined };
		} catch {
			return { failed: true, configured: true, diagnostic: diagnostic(undefined) };
		}
	});
	const provider = eavsProvider({
		...options,
		httpPolicy,
		onCatalogSummary(value) {
			catalogState.summary = value;
			options.onCatalogSummary?.(value);
		},
		onAuthChange(configured) {
			if (configured && context && !offline()) loop.start();
			else loop.stop();
		},
	});
	// The SDK's native registration starts cache restoration asynchronously.
	// Prime live startup before registration using its public credential-only
	// reader (no interpolation/command execution and no credential writes).
	if (!offline()) {
		try {
			const credential = readCredential("eavs");
			if (credential)
				await provider.refreshModels?.({
					credential,
					allowNetwork: true,
					signal: new AbortController().signal,
					publish: async (publication) => {
						publication.update?.();
						return true;
					},
				});
		} catch {
			/* Session polling retries; never log credentials/transport errors. */
		}
	}
	pi.registerProvider(provider);
	pi.on("session_start", async (_event, ctx) => {
		context = ctx;
		try {
			const credential = readCredential("eavs");
			const server = credential?.type === "api_key" ? credential.env?.EAVS_SERVER : undefined;
			warnDirectGatewayEntries(ctx, server ? serverAddress(server) : undefined);
		} catch {
			/* Advisory only; never block startup or surface credential state. */
		}
		if (!offline()) loop.start();
	});
	pi.on("session_shutdown", async () => {
		context = undefined;
		httpPolicy.clear();
		loop.stop();
	});
	pi.registerCommand("eavs-refresh", {
		description: "Refresh EAVS scoped chat metadata; no probe or inference",
		async handler(args, ctx) {
			if (args.trim()) {
				ctx.ui.notify("EAVS refresh accepts no arguments. Use /login to change the connection.", "warning");
				return;
			}
			if (offline()) {
				ctx.ui.notify("EAVS metadata network refresh is disabled by PI_OFFLINE.", "warning");
				return;
			}
			context = ctx;
			catalogState.summary = undefined;
			const outcome = await loop.run();
			const summary = catalogState.summary as CatalogSummary | undefined;
			ctx.ui.notify(
				!outcome.configured
					? "EAVS is not connected. Use /login."
					: outcome.failed
						? `EAVS metadata refresh failed. ${outcome.diagnostic ?? diagnostic(undefined)} No inference attempted.`
						: summary
							? `EAVS metadata refreshed: ${summary.models} models; omitted ${summary.skipped} with invalid pricing or capabilities. ${summary.unknownPricing} models have unknown pricing (zero local accounting placeholders, not verified free). Gateway authorization and budgets still apply.`
							: "EAVS chat metadata refreshed; empty scope has no models. Prices are unverified estimates.",
				outcome.failed || !outcome.configured || (summary?.skipped ?? 0) > 0 ? "warning" : "info"
			);
		},
	});
}

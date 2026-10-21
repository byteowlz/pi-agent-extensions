import { type ExtensionAPI, type ExtensionContext, readStoredCredential } from "@earendil-works/pi-coding-agent";
import { eavsProvider } from "./provider.js";
import { RefreshLoop } from "./refresh-loop.js";

export default async function (pi: ExtensionAPI) {
	let context: ExtensionContext | undefined;
	const offline = () => process.env.PI_OFFLINE !== undefined;
	const loop = new RefreshLoop(async (signal) => {
		if (!context || offline()) return { failed: false, configured: false };
		const auth = await context.modelRegistry.getProviderAuth("eavs");
		if (!auth || signal.aborted) return { failed: false, configured: false };
		const result = await context.modelRegistry.refresh({ providers: ["eavs"], force: true, allowNetwork: true, signal });
		return { failed: result.aborted || result.errors.has("eavs"), configured: true };
	});
	const provider = eavsProvider({
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
			const credential = readStoredCredential("eavs");
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
		if (!offline()) loop.start();
	});
	pi.on("session_shutdown", async () => {
		context = undefined;
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
			const outcome = await loop.run();
			ctx.ui.notify(
				!outcome.configured
					? "EAVS is not connected. Use /login."
					: outcome.failed
						? "EAVS metadata refresh failed or cancelled. Transient failures retain cached models; revoked or invalid scope removes them. Gateway authorization still applies. No inference attempted."
						: "EAVS chat metadata refreshed; empty scope has no models. Prices are unverified estimates.",
				outcome.failed || !outcome.configured ? "warning" : "info"
			);
		},
	});
}

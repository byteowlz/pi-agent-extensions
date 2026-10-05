import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { PresentationBinding, PresentationQuery, PresentationSnapshot } from "../pi-capabilities/contract.js";

/** Type-only contract import: pi-capabilities need not be installed or loaded. */
export function discoverPresentations(pi: Pick<ExtensionAPI, "events">, scopeId: string): readonly PresentationBinding[] {
	let result: readonly PresentationBinding[] = [];
	let accepting = true;
	const query: PresentationQuery = {
		version: 1,
		scopeId,
		reply: (snapshot: PresentationSnapshot) => {
			if (!accepting || !snapshot || snapshot.version !== 1 || snapshot.scopeId !== scopeId || !Array.isArray(snapshot.bindings))
				return;
			result = snapshot.bindings
				.filter(
					(binding) =>
						!!binding &&
						typeof binding === "object" &&
						typeof binding.id === "string" &&
						binding.id.length > 0 &&
						binding.id.length <= 128 &&
						["oqto-web", "oqto-desktop", "pi-tui-rpc", "other-rpc"].includes(binding.clientKind) &&
						Array.isArray(binding.capabilities) &&
						binding.capabilities.every(
							(capability: unknown) => capability === "selection.questions.v1" || capability === "selection.review.v1"
						) &&
						Number.isFinite(binding.expiresAt) &&
						binding.expiresAt > Date.now()
				)
				.map((binding) => ({ ...binding, capabilities: [...binding.capabilities] }));
		},
	};
	try {
		pi.events.emit("pi-capabilities:query/v1", query);
	} finally {
		accepting = false;
	}
	return result;
}

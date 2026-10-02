import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { PresentationBindRequest, PresentationCommand, PresentationReply, PresentationUnbindRequest } from "./contract.js";
import { QUERY_EVENT, REPLY_STATUS, isRecord, parseRequest } from "./protocol.js";
import { PresentationRegistry } from "./registry.js";

function handleMetadata(
	registry: PresentationRegistry,
	command: PresentationCommand,
	args: string,
	scopeId: string
): PresentationReply {
	const parsed = parseRequest(command, args);
	const requestId = parsed.ok ? parsed.request.requestId : parsed.requestId;
	const correlation = requestId === undefined ? {} : { requestId };
	if (!parsed.ok) return { version: 1, ...correlation, command, ok: false, error: "invalid-request" };
	if (command === "presentation-bind") registry.bind(scopeId, parsed.request as PresentationBindRequest);
	if (command === "presentation-unbind") registry.unbind(scopeId, (parsed.request as PresentationUnbindRequest).id);
	return { version: 1, ...correlation, command, ok: true, snapshot: registry.snapshot(scopeId) };
}

export default function capabilitiesExtension(pi: ExtensionAPI): void {
	const registry = new PresentationRegistry();
	let unsubscribe: (() => void) | undefined;
	const subscribe = () => {
		if (unsubscribe) return;
		unsubscribe = pi.events.on(QUERY_EVENT, (data: unknown) => {
			if (
				!isRecord(data) ||
				data.version !== 1 ||
				typeof data.scopeId !== "string" ||
				!data.scopeId ||
				typeof data.reply !== "function"
			)
				return;
			data.reply(registry.snapshot(data.scopeId));
		});
	};
	// Session-start registration avoids a bus resource in discovery-only factory loads.
	pi.on("session_start", () => {
		registry.clear();
		subscribe();
	});
	pi.on("session_tree", () => {
		registry.clear();
	});
	pi.on("session_shutdown", () => {
		registry.clear();
		unsubscribe?.();
		unsubscribe = undefined;
	});
	for (const command of [
		"presentation-bind",
		"presentation-unbind",
		"presentation-list",
	] as const satisfies readonly PresentationCommand[]) {
		pi.registerCommand(command, {
			description: "Manage optional presentation routing metadata (JSON v1; not authorization)",
			handler: async (args, ctx) => {
				const reply = handleMetadata(registry, command, args, ctx.sessionManager.getSessionId());
				if (ctx.mode === "rpc") ctx.ui.setStatus(REPLY_STATUS, JSON.stringify(reply));
				else if (ctx.mode === "tui")
					ctx.ui.notify(
						reply.ok
							? `Presentation metadata: ${reply.snapshot.bindings.length} active binding(s).`
							: "Invalid presentation metadata request.",
						reply.ok ? "info" : "warning"
					);
			},
		});
	}
}

/**
 * Personal-placement command engine: catalog + catalog-fenced dispatch.
 *
 * Verified against installed Pi 1.4.0:
 * - `pi.getCommands()` enumerates registered extension commands, prompt templates
 *   and skills (name/description/source), but not builtins.
 * - `pi.sendUserMessage(text, { expandPromptTemplates: true })` routes a leading
 *   `/name args` to the registered command handler synchronously; an unregistered
 *   name falls through to the model (`agent-session.js` `_tryExecuteExtensionCommand`).
 * - Handler errors are reported through the extension error channel but still
 *   count as handled.
 * - Pi issues no catalog generation; the producer mints one over its runtime
 *   epoch. There is no dispatch disposition in the extension API.
 *
 * Safety therefore comes from the fence, not from trusting the text: dispatch
 * takes a catalog command id, re-lists commands immediately before sending, and
 * only then calls the host. Unknown or stale ids never reach the prompt channel.
 * Builtins need a host-supplied typed-operation dispatcher; they are not
 * enumerable through the public package root in 1.4.0.
 */

import { createHash } from "node:crypto";
import type { DispatchOperation } from "../runtime-interactions/interaction-port.js";
import type { RuntimeCommandCatalog } from "../runtime-interactions/protocol/runtime-interactions/v1/RuntimeCommandCatalog.js";
import type { RuntimeCommandDescriptor } from "../runtime-interactions/protocol/runtime-interactions/v1/RuntimeCommandDescriptor.js";
import type { RuntimeCommandReceipt } from "../runtime-interactions/protocol/runtime-interactions/v1/RuntimeCommandReceipt.js";
import type { RuntimeGeneration } from "../runtime-interactions/protocol/runtime-interactions/v1/RuntimeGeneration.js";

/** Registered command as reported by `pi.getCommands()`. */
export interface RegisteredPiCommand {
	name: string;
	description?: string;
	source: "extension" | "prompt" | "skill";
}

/** Builtin descriptor from a first-party provider; not public in Pi 1.4.0. */
export interface BuiltinPiCommand {
	name: string;
	description: string;
	argumentHint?: string;
}

/** Host surface; the bridge supplies the real Pi bindings. */
export interface PiCommandHost {
	listRegistered(): RegisteredPiCommand[];
	/** Sends `/<name> <args>` with expandPromptTemplates:true. Must throw on refusal. */
	dispatchRegistered(text: string): void | Promise<void>;
	/** Producer-issued correlation id; Pi returns none, so the host owns it. */
	newOperationId(): string;
	/** Optional first-party builtin catalog + typed-operation dispatcher. */
	builtins?(): BuiltinPiCommand[];
	dispatchBuiltin?(name: string, args: string): "handled" | "queued" | "started" | "unsupported";
	isStreaming?(): boolean;
	/** Source-owned continuity epoch; the catalog generation is derived from it. */
	runtimeGeneration(): string;
}

function commandIdFor(source: RegisteredPiCommand["source"] | "builtin", name: string): string {
	return `${source}:${name}`;
}

function descriptor(
	commandId: string,
	invocation: string,
	description: string | null,
	origin: RegisteredPiCommand["source"] | "builtin",
	availability: RuntimeCommandDescriptor["availability"]
): RuntimeCommandDescriptor {
	return {
		commandId,
		invocation,
		description,
		origin,
		arguments: { kind: "raw_string" },
		availability,
		requiredInteractions: [],
	};
}

export function createPiCommandEngine(host: PiCommandHost) {
	// The host owns correlation ids: Pi's sendUserMessage returns void, so the
	// engine must not fabricate a Pi operation identity.
	const operationId = () => host.newOperationId();

	const descriptors = (): RuntimeCommandDescriptor[] => {
		const registered = host.listRegistered().map((command) =>
			descriptor(commandIdFor(command.source, command.name), `/${command.name}`, command.description ?? null, command.source, {
				state: "available",
			})
		);
		const builtins = (host.builtins?.() ?? []).map((command) =>
			descriptor(
				commandIdFor("builtin", command.name),
				`/${command.name}`,
				command.argumentHint ? `${command.description} (${command.argumentHint})` : command.description,
				"builtin",
				host.dispatchBuiltin ? { state: "available" } : { state: "unavailable", reason: "unsupported_operation" }
			)
		);
		return [...registered, ...builtins].sort((a, b) => a.commandId.localeCompare(b.commandId));
	};

	const generationOf = (commands: RuntimeCommandDescriptor[]): RuntimeGeneration =>
		createHash("sha256")
			.update(JSON.stringify({ epoch: host.runtimeGeneration(), commands: commands.map((c) => c.commandId) }))
			.digest("hex");

	const catalog = (): RuntimeCommandCatalog => {
		const commands = descriptors();
		return {
			generation: generationOf(commands),
			coverage: host.builtins ? "full" : "registered_only",
			commands,
		};
	};

	async function dispatch(operation: DispatchOperation): Promise<RuntimeCommandReceipt> {
		const current = catalog();
		const reject = (rejection: RuntimeCommandReceipt["rejection"]): RuntimeCommandReceipt => ({
			operationId: operationId(),
			commandId: operation.commandId,
			disposition: "rejected",
			rejection,
		});
		if (operation.catalogGeneration !== current.generation) return reject("stale_generation");
		const command = current.commands.find((entry) => entry.commandId === operation.commandId);
		if (!command) return reject("unknown_command");
		if (command.availability.state === "unavailable") return reject("engine_failure");

		// Re-check the live list immediately before dispatch: the fence is the safety
		// property, not the caller's text.
		const live = descriptors();
		if (!live.some((entry) => entry.commandId === operation.commandId && entry.availability.state === "available"))
			return reject("unknown_command");

		const name = command.commandId.slice(command.commandId.indexOf(":") + 1);
		if (command.origin === "builtin") {
			if (!host.dispatchBuiltin) return reject("engine_failure");
			const result = host.dispatchBuiltin(name, operation.args);
			if (result === "unsupported") return reject("engine_failure");
			return { operationId: operationId(), commandId: operation.commandId, disposition: result, rejection: null };
		}

		// Registered command: preserve args verbatim; the name comes from the fence.
		await host.dispatchRegistered(operation.args.length > 0 ? `/${name} ${operation.args}` : `/${name}`);
		// sendUserMessage returns void (no PromptDisposition). Report accepted/started
		// with explicit uncertainty in docs — never `handled`, which would claim an
		// outcome the extension cannot observe.
		return { operationId: operationId(), commandId: operation.commandId, disposition: "started", rejection: null };
	}

	return { catalog, dispatch };
}

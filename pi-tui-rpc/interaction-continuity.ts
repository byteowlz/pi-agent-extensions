/**
 * Source-owned interaction runtime continuity.
 *
 * The value reported as `interactionRuntimeGeneration` in `get_state` must be an
 * epoch minted by the owning interaction runtime, not a timestamp, PID, grant,
 * session id or a fabricated adapter generation. This module is that owner: one
 * instance per loaded extension runtime, reissued when the interaction attachment
 * lifetime is replaced and cleared when it ends.
 *
 * Owning lifetime and reissue conditions (see docs/runtime-interaction-adapter.md):
 * - minted when the extension runtime starts (pre-session observation window),
 * - reissued on `session_start`, because a new native session attaches a new
 *   hub/lease/adapter lifetime whose continuity the host must freshly admit,
 * - cleared on `session_shutdown`/hub stop, so a missing field means "projection
 *   unavailable" rather than a stale epoch.
 *
 * Model/provider selection, compaction, reload queueing and ordinary observation
 * do NOT reissue it. An extension reload constructs a new module instance, so the
 * epoch changes and the old socket is gone.
 */

import { randomUUID } from "node:crypto";

export interface InteractionRuntimeContinuity {
	/** Current epoch, or undefined when no interaction lifetime is attached. */
	current(): string | undefined;
	/** Replace the epoch for a new attachment lifetime and return it. */
	reissue(reason: string): string;
	/** End the current lifetime; observation stays available without the field. */
	clear(reason: string): void;
}

export interface ContinuityOptions {
	/** Injectable mint for tests; production uses a random UUID token. */
	mint?: () => string;
}

const EPOCH = /^ir:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function createInteractionContinuity(options: ContinuityOptions = {}): InteractionRuntimeContinuity {
	const mint = options.mint ?? (() => `ir:${randomUUID()}`);
	let epoch: string | undefined;

	const fresh = (): string => {
		const value = mint();
		if (!EPOCH.test(value)) throw new Error("interaction continuity mint returned an invalid epoch");
		return value;
	};

	// The runtime exists before any session attaches; that is a real source-owned
	// lifetime, so observation can report continuity even in the pre-session window.
	epoch = fresh();

	return {
		current: () => epoch,
		reissue: (_reason: string) => {
			epoch = fresh();
			return epoch;
		},
		clear: (_reason: string) => {
			epoch = undefined;
		},
	};
}

/**
 * The exact `get_state` contribution.
 *
 * Absent means "continuity unavailable"; never emit a placeholder or a value
 * derived from another identity. The host treats missing/added/changed/lost as a
 * projection change (poison/close, fresh admission).
 */
export function interactionRuntimeMetadata(continuity: Pick<InteractionRuntimeContinuity, "current">): {
	interactionRuntimeGeneration?: string;
} {
	const epoch = continuity.current();
	return epoch === undefined ? {} : { interactionRuntimeGeneration: epoch };
}

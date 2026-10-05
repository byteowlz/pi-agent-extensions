import type { PresentationBindRequest, PresentationBinding, PresentationSnapshot } from "./contract.js";
import { DEFAULT_LEASE_MS } from "./protocol.js";

/** In-memory lease registry; no persistence, timers, authorization or transport endpoints. */
export class PresentationRegistry {
	private readonly scopes = new Map<string, Map<string, PresentationBinding>>();
	constructor(private readonly now: () => number = Date.now) {}
	bind(scopeId: string, request: PresentationBindRequest): void {
		// Prune expired leases before replacing/renewing a stable ID.
		this.snapshot(scopeId);
		let bindings = this.scopes.get(scopeId);
		if (!bindings) {
			bindings = new Map();
			this.scopes.set(scopeId, bindings);
		}
		bindings.set(
			request.id,
			Object.freeze({
				id: request.id,
				clientKind: request.clientKind,
				capabilities: Object.freeze([...request.capabilities]),
				expiresAt: this.now() + (request.leaseMs ?? DEFAULT_LEASE_MS),
			})
		);
	}
	unbind(scopeId: string, id: string): void {
		this.scopes.get(scopeId)?.delete(id);
	}
	clear(): void {
		this.scopes.clear();
	}
	snapshot(scopeId: string): PresentationSnapshot {
		const bindings = this.scopes.get(scopeId);
		const now = this.now();
		if (bindings) {
			for (const [id, binding] of bindings) if (binding.expiresAt <= now) bindings.delete(id);
			if (bindings.size === 0) this.scopes.delete(scopeId);
		}
		return Object.freeze({
			version: 1,
			scopeId,
			bindings: Object.freeze(
				[...(bindings?.values() ?? [])]
					.sort((a, b) => a.id.localeCompare(b.id))
					.map((binding) =>
						Object.freeze({
							...binding,
							capabilities: Object.freeze([...binding.capabilities]),
						})
					)
			),
		});
	}
}

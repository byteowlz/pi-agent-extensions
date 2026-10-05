import { setTimeout as delay } from "node:timers/promises";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { startBrowserReview } from "./browser.js";
import type { Answers, SelectionRecord, TuiOutcome } from "./model.js";
import { discoverPresentations } from "./presentation.js";
import { SelectionStore } from "./store.js";
import { showSelectionTui } from "./tui.js";

export type PresentationMode = "auto" | "tui" | "browser" | "host" | "none";
export interface SelectionRequest {
	action: "ask" | "create" | "get" | "open" | "close";
	id?: string;
	revision?: number;
	spec?: unknown;
	presentation?: PresentationMode;
	bindingId?: string;
}
export interface SelectionResult {
	record: SelectionRecord;
	presentation: { kind: "none" | "tui" | "browser" | "host"; url?: string; bindingIds?: string[] };
}
export interface RuntimeOptions {
	root: string;
	lanAddress?: string;
	browserTtlMs?: number;
}
export interface RuntimePresenters {
	browser: typeof startBrowserReview;
	tui: typeof showSelectionTui;
}
interface HostPending {
	scopeId: string;
	bindings: Set<string>;
	capability: "selection.questions.v1" | "selection.review.v1";
	acknowledged?: string;
}

type Progress = (result: SelectionResult) => void;

/** Routing advertisements do not authorize this data or any downstream action. */
export class SelectionRuntime {
	readonly store: SelectionStore;
	private epoch = 0;
	private lifetime = new AbortController();
	private browsers = new Map<string, { close(): Promise<void> }>();
	private hosts = new Map<string, HostPending>();
	private active = new Set<string>();
	private statusReview?: string;

	constructor(
		private readonly pi: ExtensionAPI,
		private readonly options: RuntimeOptions,
		private readonly presenters: RuntimePresenters = { browser: startBrowserReview, tui: showSelectionTui }
	) {
		this.store = new SelectionStore(options.root);
	}

	async reset(): Promise<void> {
		this.epoch++;
		this.lifetime.abort();
		this.lifetime = new AbortController();
		this.hosts.clear();
		this.active.clear();
		this.statusReview = undefined;
		const browsers = [...this.browsers.values()];
		this.browsers.clear();
		const results = await Promise.allSettled(browsers.map((browser) => browser.close()));
		const failure = results.find((result) => result.status === "rejected");
		if (failure?.status === "rejected") throw failure.reason;
	}

	private scope(ctx: ExtensionContext): string {
		const scope = ctx.sessionManager.getSessionId();
		if (!scope || scope.startsWith("pending-") || scope.startsWith("tmp:")) throw new Error("No durable native session identity");
		return scope;
	}

	private fence(ctx: ExtensionContext, scope: string, epoch: number, signal?: AbortSignal): void {
		if (this.epoch !== epoch || signal?.aborted || ctx.signal?.aborted || this.scope(ctx) !== scope) {
			throw new Error("Selection request was cancelled or its session changed; persisted drafts remain available");
		}
	}

	async execute(
		ctx: ExtensionContext,
		request: SelectionRequest,
		signal?: AbortSignal,
		progress?: Progress
	): Promise<SelectionResult> {
		const signals = [this.lifetime.signal, signal, ctx.signal].filter((value): value is AbortSignal => !!value);
		const combined = AbortSignal.any(signals);
		return this.executeScoped({ ...ctx, signal: combined }, request, combined, progress);
	}

	private async executeScoped(
		ctx: ExtensionContext,
		request: SelectionRequest,
		signal: AbortSignal,
		progress?: Progress
	): Promise<SelectionResult> {
		const scope = this.scope(ctx);
		const epoch = this.epoch;
		const guard = () => this.fence(ctx, scope, epoch, signal);
		guard();
		let record: SelectionRecord;
		if (request.action === "ask" || request.action === "create") {
			record = await this.store.create(scope, request.spec);
		} else {
			if (!request.id) throw new Error("Review id is required");
			record = await this.store.get(request.id, scope);
		}
		guard();
		if (request.action === "close") {
			record = await this.store.cancel(record.id, scope, request.revision ?? record.revision);
			guard();
			await this.closeBrowser(record.id);
			guard();
			this.hosts.delete(record.id);
			if (this.statusReview === record.id) {
				this.statusReview = undefined;
				ctx.ui.setStatus("pi-selection:present/v1", undefined);
			}
			return { record, presentation: { kind: "none" } };
		}
		if (request.action === "get" || record.state !== "draft") return { record, presentation: { kind: "none" } };
		if (this.active.has(record.id)) throw new Error("Review already has an active presentation request");
		this.active.add(record.id);
		try {
			return await this.presentAndWait(ctx, record, request, guard, signal, progress);
		} catch (error) {
			// A stale operation must not tear down a newer presentation of the same draft.
			if (this.epoch === epoch) {
				this.hosts.delete(record.id);
				await this.closeBrowser(record.id);
			}
			throw error;
		} finally {
			if (this.epoch === epoch) {
				this.active.delete(record.id);
				if (this.statusReview === record.id && (request.action === "ask" || !this.hosts.has(record.id))) {
					this.statusReview = undefined;
					ctx.ui.setStatus("pi-selection:present/v1", undefined);
				}
			}
		}
	}

	private async presentAndWait(
		ctx: ExtensionContext,
		record: SelectionRecord,
		request: SelectionRequest,
		guard: () => void,
		signal: AbortSignal,
		progress?: Progress
	): Promise<SelectionResult> {
		const scope = record.scopeId;
		let result = await this.present(ctx, record, request, guard);
		guard();
		progress?.(result);
		if (result.record.state !== "draft") {
			await this.closeBrowser(record.id);
			guard();
			this.hosts.delete(record.id);
			return result;
		}
		if (request.action !== "ask") return result;
		if (result.presentation.kind === "none") throw new Error("ask requires an interactive or browser presentation");
		if (result.presentation.kind === "host") {
			result = await this.waitForHost(result, request, guard, signal);
			guard();
			if (result.presentation.kind === "browser") progress?.(result);
		}
		let browserDeadline = Date.now() + (this.options.browserTtlMs ?? 1_800_000);
		while (result.record.state === "draft") {
			await delay(250, undefined, { signal });
			guard();
			result = { ...result, record: await this.store.get(record.id, scope) };
			guard();
			if (result.record.state !== "draft") break;
			if (result.presentation.kind === "host" && !this.hostIsLive(record)) {
				this.hosts.delete(record.id);
				if (request.presentation === "host" || request.bindingId)
					throw new Error("Presentation host disconnected or lease expired");
				result = await this.browser(result.record, guard);
				browserDeadline = Date.now() + (this.options.browserTtlMs ?? 1_800_000);
				progress?.(result);
			}
			if (result.presentation.kind === "browser" && Date.now() >= browserDeadline)
				throw new Error("Browser presentation expired; persisted draft remains available");
		}
		guard();
		await this.closeBrowser(record.id);
		this.hosts.delete(record.id);
		return result;
	}

	private async waitForHost(
		result: SelectionResult,
		request: SelectionRequest,
		guard: () => void,
		signal: AbortSignal
	): Promise<SelectionResult> {
		const { record } = result;
		// A claim without an actual renderer must never silently swallow a review.
		for (let attempts = 0; attempts < 20 && !this.hosts.get(record.id)?.acknowledged; attempts++) {
			await delay(100, undefined, { signal });
			guard();
		}
		if (this.hosts.get(record.id)?.acknowledged) return result;
		this.hosts.delete(record.id);
		if (request.presentation === "host" || request.bindingId)
			throw new Error("Advertised host did not acknowledge the review renderer");
		const fresh = await this.store.get(record.id, record.scopeId);
		guard();
		if (fresh.state !== "draft") return { ...result, record: fresh };
		return this.browser(fresh, guard);
	}

	private async present(
		ctx: ExtensionContext,
		record: SelectionRecord,
		request: SelectionRequest,
		guard: () => void
	): Promise<SelectionResult> {
		const mode = request.presentation ?? "auto";
		if (mode === "none") return { record, presentation: { kind: "none" } };
		if (mode === "tui" || (mode === "auto" && ctx.mode === "tui" && !request.bindingId)) {
			if (ctx.mode !== "tui") throw new Error("Custom terminal selection requires native Pi TUI");
			const outcome = await this.presenters.tui(ctx, record);
			guard();
			return this.finishTui(record, outcome, guard);
		}
		if (mode !== "browser") {
			const capability = record.spec.mode === "review" ? "selection.review.v1" : "selection.questions.v1";
			const bindings = discoverPresentations(this.pi, record.scopeId).filter(
				(binding) => binding.capabilities.includes(capability) && (!request.bindingId || request.bindingId === binding.id)
			);
			if (bindings.length) {
				const bindingIds = bindings.map((binding) => binding.id);
				this.hosts.set(record.id, {
					scopeId: record.scopeId,
					bindings: new Set(bindingIds),
					capability,
					acknowledged: undefined,
				});
				const payload = { version: 1, bindingIds, review: record };
				this.pi.events.emit("pi-selection:present/v1", payload);
				guard();
				if (ctx.mode === "rpc") {
					this.statusReview = record.id;
					ctx.ui.setStatus("pi-selection:present/v1", JSON.stringify(payload));
				}
				return { record, presentation: { kind: "host", bindingIds } };
			}
			if (mode === "host" || request.bindingId) throw new Error("No live binding supports this selection schema");
		}
		return this.browser(record, guard);
	}

	private async finishTui(record: SelectionRecord, outcome: TuiOutcome, guard: () => void): Promise<SelectionResult> {
		if (!outcome) throw new Error("Terminal selection ended without a result");
		guard();
		if (outcome.action === "cancel") {
			const cancelled = await this.store.cancel(record.id, record.scopeId, record.revision, outcome.answers);
			guard();
			return { record: cancelled, presentation: { kind: "tui" } };
		}
		const saved = await this.store.update(
			record.id,
			record.scopeId,
			record.revision,
			outcome.answers,
			outcome.action === "submit"
		);
		guard();
		if (outcome.action === "browser") return this.browser(saved, guard);
		return { record: saved, presentation: { kind: "tui" } };
	}

	private async browser(record: SelectionRecord, guard: () => void): Promise<SelectionResult> {
		await this.closeBrowser(record.id);
		guard();
		let browser: Awaited<ReturnType<typeof startBrowserReview>>;
		try {
			browser = await this.presenters.browser(this.store, record, { mode: "tailnet", ttlMs: this.options.browserTtlMs });
		} catch (error) {
			guard();
			if (!this.options.lanAddress) throw error;
			browser = await this.presenters.browser(this.store, record, {
				mode: "lan",
				bindAddress: this.options.lanAddress,
				ttlMs: this.options.browserTtlMs,
			});
		}
		try {
			guard();
		} catch (error) {
			await browser.close();
			throw error;
		}
		this.browsers.set(record.id, browser);
		return { record, presentation: { kind: "browser", url: browser.url } };
	}

	private async closeBrowser(id: string): Promise<void> {
		const browser = this.browsers.get(id);
		this.browsers.delete(id);
		await browser?.close();
	}

	private hostIsLive(record: SelectionRecord): boolean {
		const pending = this.hosts.get(record.id);
		const capability = record.spec.mode === "review" ? "selection.review.v1" : "selection.questions.v1";
		return (
			!!pending?.acknowledged &&
			discoverPresentations(this.pi, record.scopeId).some(
				(binding) => binding.id === pending.acknowledged && binding.capabilities.includes(capability)
			)
		);
	}

	async acknowledge(ctx: ExtensionContext, id: string, bindingId: string): Promise<void> {
		const scope = this.scope(ctx);
		const pending = this.hosts.get(id);
		const live = discoverPresentations(this.pi, scope).some(
			(binding) => binding.id === bindingId && !!pending && binding.capabilities.includes(pending.capability)
		);
		if (!pending || pending.scopeId !== scope || !pending.bindings.has(bindingId) || !live)
			throw new Error("Unknown or expired presentation binding");
		pending.acknowledged = bindingId;
	}

	async saveFromHost(
		ctx: ExtensionContext,
		id: string,
		revision: number,
		answers: Answers,
		submit: boolean
	): Promise<SelectionRecord> {
		// The transport owner MUST authorize the connected user before forwarding.
		const scope = this.scope(ctx);
		const epoch = this.epoch;
		this.fence(ctx, scope, epoch);
		const record = await this.store.update(id, scope, revision, answers, submit);
		this.fence(ctx, scope, epoch);
		return record;
	}
}

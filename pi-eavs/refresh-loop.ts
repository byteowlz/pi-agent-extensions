export interface RefreshOutcome {
	failed: boolean;
	configured: boolean;
	diagnostic?: string;
}

/** Session-owned bounded polling: one request at a time, exponential backoff,
 * no catch-up bursts. A manual refresh joins the same in-flight operation. */
export class RefreshLoop {
	private timer?: ReturnType<typeof setTimeout>;
	private pending?: Promise<RefreshOutcome>;
	private controller?: AbortController;
	private enabled = false;
	private failures = 0;
	constructor(
		private readonly refresh: (signal: AbortSignal) => Promise<RefreshOutcome>,
		private readonly intervalMs = 60_000,
		private readonly maxBackoffMs = 15 * 60_000
	) {}
	start(): void {
		if (this.enabled) return;
		this.enabled = true;
		this.schedule(0);
	}
	stop(): void {
		this.enabled = false;
		this.failures = 0;
		clearTimeout(this.timer);
		this.timer = undefined;
		this.controller?.abort();
	}
	private schedule(delay: number): void {
		if (!this.enabled || this.timer || this.pending) return;
		this.timer = setTimeout(() => {
			this.timer = undefined;
			void this.run();
		}, delay);
		this.timer.unref?.();
	}
	run(): Promise<RefreshOutcome> {
		if (this.pending) return this.pending;
		clearTimeout(this.timer);
		this.timer = undefined;
		const controller = new AbortController();
		this.controller = controller;
		const operation = (async () => {
			let outcome: RefreshOutcome;
			try {
				outcome = await this.refresh(controller.signal);
			} catch {
				outcome = { failed: true, configured: true };
			}
			if (!outcome.configured) this.stop();
			this.failures = outcome.failed ? Math.min(this.failures + 1, 8) : 0;
			return outcome;
		})();
		this.pending = operation;
		void operation.finally(() => {
			if (this.pending === operation) {
				this.pending = undefined;
				this.controller = undefined;
			}
			this.schedule(Math.min(this.maxBackoffMs, this.intervalMs * 2 ** this.failures));
		});
		return operation;
	}
}

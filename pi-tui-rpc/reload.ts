/**
 * Reload this Pi's extensions, now when it is idle, or queued until the current
 * run and any compaction finish. Reloading mid-run would swap the extension
 * runtime under a live turn; RPC-mode Pi reloads without checking, and the TUI
 * refuses while streaming, so the wait lives here.
 */

/** The command-context operations a reload needs (ExtensionCommandContext). */
export interface ReloadRuntime {
	isIdle(): boolean;
	waitForIdle(): Promise<void>;
	reload(): Promise<void>;
}

export type ReloadRequest = "reloading" | "queued" | "already_pending";

export interface ReloaderOptions {
	isCompacting(): boolean;
	/** Progress for clients and the TUI: queued, reloading, failed. */
	onState?(state: "queued" | "reloading" | "failed", detail?: string): void;
	sleep?(ms: number): Promise<void>;
}

const RECHECK_MS = 500;

export function createReloader(options: ReloaderOptions) {
	const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
	let pending = false;
	let replaced = false;
	let stopped = false;

	const busy = (runtime: ReloadRuntime): boolean => !runtime.isIdle() || options.isCompacting();

	const run = async (runtime: ReloadRuntime): Promise<void> => {
		try {
			while (!stopped) {
				await runtime.waitForIdle();
				if (stopped) break;
				// agent_end is not final idle: retries, compaction and queued
				// follow-ups can start another run right away.
				if (busy(runtime)) {
					await sleep(RECHECK_MS);
					continue;
				}
				options.onState?.("reloading");
				await runtime.reload();
				// This runtime is gone; the reloaded extension starts fresh.
				if (replaced) return;
				// Refused (a run started in between): wait for idle again.
				await sleep(RECHECK_MS);
			}
			pending = false;
		} catch (error) {
			pending = false;
			options.onState?.("failed", error instanceof Error ? error.message : String(error));
		}
	};

	return {
		pending: () => pending,
		/** What a request would do right now, without starting one. */
		preview(runtimeBusy: boolean): ReloadRequest {
			if (pending) return "already_pending";
			return runtimeBusy || options.isCompacting() ? "queued" : "reloading";
		},
		request(runtime: ReloadRuntime): ReloadRequest {
			if (pending) return "already_pending";
			pending = true;
			const queued = busy(runtime);
			if (queued) options.onState?.("queued");
			void run(runtime);
			return queued ? "queued" : "reloading";
		},
		/** session_shutdown on this runtime: reason "reload" means it worked. */
		shutdown(reason: string): void {
			if (reason === "reload") replaced = true;
			else stopped = true;
		},
	};
}

export type Reloader = ReturnType<typeof createReloader>;

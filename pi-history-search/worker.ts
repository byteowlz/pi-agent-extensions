import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import type { WorkerMethods } from "./worker-entry.js";

type Job = {
	method: keyof WorkerMethods;
	args: unknown[];
	signal?: AbortSignal;
	timeoutMs: number;
	resolve: (value: unknown) => void;
	reject: (error: Error) => void;
	detach: () => void;
};
const MAX_BYTES = 2 * 1024 * 1024;
/** A process worker, not a microtask: sync SQLite, JSON and regex cannot block Pi. */
export class HistoryWorker {
	private queue: Job[] = [];
	private active = new Set<() => void>();

	call<K extends keyof WorkerMethods>(
		method: K,
		args: Parameters<WorkerMethods[K]>,
		signal?: AbortSignal,
		timeoutMs = 30000
	): Promise<Awaited<ReturnType<WorkerMethods[K]>>> {
		if (signal?.aborted) return Promise.reject(new Error("History operation aborted"));
		if (this.queue.length >= 8)
			return Promise.reject(new Error("History worker queue is full; retry after current requests finish"));
		return new Promise((resolve, reject) => {
			const job: Job = {
				method,
				args,
				signal,
				timeoutMs,
				resolve: resolve as (value: unknown) => void,
				reject,
				detach: () => {
					/* Installed below. */
				},
			};
			const abort = () => {
				const index = this.queue.indexOf(job);
				if (index >= 0) {
					this.queue.splice(index, 1);
					job.detach();
					reject(new Error("History operation aborted"));
				}
			};
			job.detach = () => signal?.removeEventListener("abort", abort);
			signal?.addEventListener("abort", abort, { once: true });
			this.queue.push(job);
			this.pump();
		});
	}

	reset(): void {
		const queued = this.queue.splice(0);
		for (const job of queued) {
			job.detach();
			job.reject(new Error("History session changed or shut down"));
		}
		for (const cancel of [...this.active]) cancel();
	}

	private pump(): void {
		while (this.active.size < 2 && this.queue.length) {
			const job = this.queue.shift();
			if (job) this.start(job);
		}
	}

	private start(job: Job): void {
		job.detach();
		let payload: string;
		try {
			payload = JSON.stringify({ method: job.method, args: job.args });
		} catch {
			job.reject(new Error("History request cannot be serialized"));
			return;
		}
		if (Buffer.byteLength(payload) > 1024 * 1024) {
			job.reject(new Error("History request exceeds worker IPC limit"));
			return;
		}
		const child = spawn(process.execPath, [fileURLToPath(new URL("./worker-runtime.mjs", import.meta.url))], {
			stdio: ["pipe", "pipe", "pipe"],
		});
		let output = "";
		let diagnostic = "";
		let settled = false;
		const finish = (error?: Error, value?: unknown) => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			job.signal?.removeEventListener("abort", cancel);
			if (error) child.kill("SIGKILL");
			if (error) job.reject(error);
			else job.resolve(value);
		};
		const cancel = () => finish(new Error("History operation aborted; worker stopped"));
		this.active.add(cancel);
		const timer = setTimeout(
			() => finish(new Error(`History worker deadline exceeded (${job.timeoutMs}ms); narrow the request`)),
			job.timeoutMs
		);
		job.signal?.addEventListener("abort", cancel, { once: true });
		child.stdout.setEncoding("utf8");
		child.stderr.setEncoding("utf8");
		child.stdout.on("data", (chunk: string) => {
			output += chunk;
			if (Buffer.byteLength(output) > MAX_BYTES) finish(new Error("History worker response exceeds IPC limit"));
		});
		child.stderr.on("data", (chunk: string) => {
			diagnostic = (diagnostic + chunk).slice(-2000);
		});
		child.stdin.on("error", () => {
			/* Early worker failure is handled by close. */
		});
		child.once("error", (error) => {
			finish(error);
		});
		child.once("close", () => {
			if (!settled) {
				try {
					const result = JSON.parse(output) as { ok: boolean; value?: unknown; error?: string };
					if (result.ok === true) finish(undefined, result.value);
					else finish(new Error(result.error ?? "History worker failed"));
				} catch {
					finish(new Error(`History worker exited without a valid response: ${diagnostic}`));
				}
			}
			this.active.delete(cancel);
			this.pump();
		});
		child.stdin.end(payload);
		if (job.signal?.aborted) cancel();
	}
}

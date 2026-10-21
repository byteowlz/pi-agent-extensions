export const APPROVAL_TIMEOUT_SECONDS = 120;
export const ACCESS_TTL_SECONDS = 900;

/** A deadline invalidates the whole continuation, not just the visible dialog. */
export async function withApprovalDeadline<T>(
	seconds: number,
	signal: AbortSignal | undefined,
	work: (check: () => void) => Promise<T>
): Promise<T> {
	let active = true;
	const deadline = Date.now() + seconds * 1000;
	const check = () => {
		if (!active || signal?.aborted || Date.now() >= deadline) throw new Error("SSH approval expired or cancelled");
	};
	let timer: ReturnType<typeof setTimeout> | undefined;
	let abort: (() => void) | undefined;
	try {
		check();
		return await Promise.race([
			Promise.resolve().then(() => work(check)),
			new Promise<never>((_, reject) => {
				abort = () => {
					active = false;
					reject(new Error("SSH approval cancelled"));
				};
				signal?.addEventListener("abort", abort, { once: true });
				timer = setTimeout(() => {
					active = false;
					reject(new Error("SSH approval timed out"));
				}, seconds * 1000);
			}),
		]);
	} finally {
		active = false;
		if (timer) clearTimeout(timer);
		if (abort) signal?.removeEventListener("abort", abort);
	}
}

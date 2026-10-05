import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
export const STATUS_QUERY = "pi:introspection:status:v1";
export type StatusValue = string | number | boolean | null;
export interface Contribution {
	id: string;
	version: 1;
	status: "ok" | "unavailable";
	details: Record<string, StatusValue>;
}
export interface StatusQuery {
	version: 1;
	sessionId: string;
	signal: AbortSignal;
	reply: (value: Promise<Contribution> | Contribution) => void;
}
export async function collectContributions(
	pi: Pick<ExtensionAPI, "events">,
	sessionId: string,
	signal?: AbortSignal
): Promise<Contribution[]> {
	if (typeof pi.events?.emit !== "function") return [];
	const controller = new AbortController();
	const abort = () => controller.abort();
	signal?.addEventListener("abort", abort, { once: true });
	if (signal?.aborted) abort();
	const pending: Promise<Contribution | null>[] = [];
	let accepting = true;
	const timer = setTimeout(abort, 300);
	const query: StatusQuery = {
		version: 1,
		sessionId,
		signal: controller.signal,
		reply(value) {
			if (!accepting || pending.length >= 16) return;
			pending.push(
				new Promise((resolve) => {
					const finish = (result: Contribution | null) => {
						controller.signal.removeEventListener("abort", cancelled);
						resolve(result);
					};
					const cancelled = () => finish(null);
					controller.signal.addEventListener("abort", cancelled, { once: true });
					if (controller.signal.aborted) {
						finish(null);
						return;
					}
					Promise.resolve(value).then(
						(result) => {
							try {
								finish(sanitize(result));
							} catch {
								finish(null);
							}
						},
						() => finish(null)
					);
				})
			);
		},
	};
	try {
		if (!controller.signal.aborted) pi.events.emit(STATUS_QUERY, query);
		accepting = false;
		const results = await Promise.all(pending);
		signal?.throwIfAborted();
		return [...new Map(results.filter((v): v is Contribution => v !== null).map((v) => [v.id, v])).values()];
	} finally {
		accepting = false;
		clearTimeout(timer);
		controller.abort();
		signal?.removeEventListener("abort", abort);
	}
}
function sanitize(value: Contribution): Contribution | null {
	if (!value || value.version !== 1 || !/^[a-z0-9-]{1,64}$/.test(value.id) || !["ok", "unavailable"].includes(value.status))
		return null;
	const details: Record<string, StatusValue> = {};
	for (const [key, item] of Object.entries(value.details ?? {}).slice(0, 32)) {
		if (!/^[a-zA-Z][a-zA-Z0-9_]{0,63}$/.test(key)) continue;
		if (typeof item === "string") details[key] = item.slice(0, 1000);
		else if (item === null || typeof item === "boolean" || (typeof item === "number" && Number.isFinite(item)))
			details[key] = item;
	}
	return { id: value.id, version: 1, status: value.status, details };
}

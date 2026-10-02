import type {
	PresentationBindRequest,
	PresentationCommand,
	PresentationListRequest,
	PresentationUnbindRequest,
} from "./contract.js";

export const QUERY_EVENT = "pi-capabilities:query/v1";
export const REPLY_STATUS = "pi-capabilities:reply/v1";
export const DEFAULT_LEASE_MS = 60_000;
const kinds = new Set(["oqto-web", "oqto-desktop", "pi-tui-rpc", "other-rpc"]);
const capabilities = new Set(["selection.questions.v1", "selection.review.v1"]);

export function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
/** Opaque stable tokens, not URLs, control sequences or secrets. */
export function isId(value: unknown): value is string {
	return typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/.test(value);
}
export type ParsedRequest = PresentationBindRequest | PresentationUnbindRequest | PresentationListRequest;
export type ParseResult = { ok: true; request: ParsedRequest } | { ok: false; requestId?: string };

export function parseRequest(command: PresentationCommand, text: string): ParseResult {
	let value: unknown;
	try {
		value = JSON.parse(text);
	} catch {
		return { ok: false };
	}
	if (!isRecord(value)) return { ok: false };
	const requestId = isId(value.requestId) ? value.requestId : undefined;
	const fail: ParseResult = { ok: false, ...(requestId === undefined ? {} : { requestId }) };
	const allowed = new Set(["version", "requestId"]);
	if (command !== "presentation-list") allowed.add("id");
	if (command === "presentation-bind") for (const key of ["clientKind", "capabilities", "leaseMs"]) allowed.add(key);
	if (
		Object.keys(value).some((key) => !allowed.has(key)) ||
		value.version !== 1 ||
		(value.requestId !== undefined && !isId(value.requestId))
	)
		return fail;
	if (command !== "presentation-list" && !isId(value.id)) return fail;
	if (command === "presentation-bind") {
		if (
			typeof value.clientKind !== "string" ||
			!kinds.has(value.clientKind) ||
			!Array.isArray(value.capabilities) ||
			value.capabilities.length > capabilities.size ||
			value.capabilities.some((item) => typeof item !== "string" || !capabilities.has(item)) ||
			new Set(value.capabilities).size !== value.capabilities.length
		)
			return fail;
		if (
			value.leaseMs !== undefined &&
			(typeof value.leaseMs !== "number" || !Number.isInteger(value.leaseMs) || value.leaseMs < 5000 || value.leaseMs > 600000)
		)
			return fail;
	}
	// All fields were validated above, including rejecting unknown metadata.
	return { ok: true, request: value as unknown as ParsedRequest };
}

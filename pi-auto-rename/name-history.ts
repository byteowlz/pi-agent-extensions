/**
 * Session name history: an append-only `CustomEntry` record of every name this
 * extension sets, with provenance (who set it, via which generator/model).
 *
 * Pi persists every `pi.setSessionName()` as a `session_info` entry in the
 * session JSONL (append-only, timestamped), but those entries carry no
 * provenance: a user `/name` and an extension rename are indistinguishable.
 * This sidecar adds that provenance for renames made through this extension.
 * It is routing/inspection metadata: entries never enter LLM context.
 *
 * Rendering merges annotated records with raw `session_info` entries from the
 * same branch so historical renames (made before this feature, or by other
 * extensions/users) still appear, labeled as unknown provenance.
 */

export const NAME_HISTORY_ENTRY_TYPE = "pi-auto-rename:name-history/v1";

export interface NameRecord {
	version: 1;
	name: string;
	/** Who set the name. */
	by: "user" | "agent" | "extension";
	/** How the name was produced, when the extension generated it. */
	via?:
		| "manual" // /auto-rename <name> or picked in TUI
		| "auto-llm" // first prompt → LLM summary
		| "regen-llm" // /auto-rename regen → LLM summary
		| "agent-tool" // rename_session tool
		| "prefix" // prefixOnly / inbound host label
		| "fork" // readable-id regeneration on fork
		| "deterministic"; // word/truncate fallback
	/** Model that generated the title, "provider/modelId" (LLM paths). */
	model?: string;
	timestamp: string;
	/** Session that authored the record; detects fork inheritance. */
	sessionId?: string;
}

export interface RawSessionInfo {
	timestamp: string;
	name: string | null;
}

type Normalized<T> = { ok: true; value: T } | { ok: false; error: string };

export function normalizeNameRecord(raw: unknown): Normalized<NameRecord> {
	if (typeof raw !== "object" || raw === null) return { ok: false, error: "record must be an object" };
	const r = raw as Record<string, unknown>;
	if (r.version !== 1 || typeof r.name !== "string" || !r.name) return { ok: false, error: "invalid record" };
	if (r.by !== "user" && r.by !== "agent" && r.by !== "extension") return { ok: false, error: "invalid by" };
	const validVia = new Set(["manual", "auto-llm", "regen-llm", "agent-tool", "prefix", "fork", "deterministic"]);
	const record: NameRecord = {
		version: 1,
		name: r.name,
		by: r.by,
		timestamp: typeof r.timestamp === "string" ? r.timestamp : "",
	};
	if (typeof r.via === "string" && validVia.has(r.via)) record.via = r.via as NameRecord["via"];
	if (typeof r.model === "string" && r.model) record.model = r.model;
	if (typeof r.sessionId === "string" && r.sessionId) record.sessionId = r.sessionId;
	return { ok: true, value: record };
}

/** Valid name-history records on a branch, oldest first. */
export function readNameHistory(branchEntries: readonly unknown[]): NameRecord[] {
	const out: NameRecord[] = [];
	for (const entry of branchEntries) {
		if (typeof entry !== "object" || entry === null) continue;
		const e = entry as Record<string, unknown>;
		if (e.type !== "custom" || e.customType !== NAME_HISTORY_ENTRY_TYPE) continue;
		const parsed = normalizeNameRecord(e.data);
		if (parsed.ok) out.push(parsed.value);
	}
	return out;
}

/**
 * Merge annotated records with raw `session_info` entries. A raw entry is
 * merged when an annotated record has the same name with a timestamp within
 * 5 seconds (name writes and sidecar writes happen back to back); otherwise
 * it appears with unknown provenance. Oldest first, stable order.
 */
export function mergeNameHistory(records: readonly NameRecord[], sessionInfos: readonly RawSessionInfo[]) {
	type Row = NameRecord & { raw: boolean };
	const rows: Row[] = [];
	const used = new Set<number>();
	const WINDOW_MS = 5_000;
	const time = (iso: string): number => {
		const parsed = Date.parse(iso);
		return Number.isNaN(parsed) ? Number.NaN : parsed;
	};
	for (const info of sessionInfos) {
		const t = time(info.timestamp);
		let merged = false;
		if (!Number.isNaN(t)) {
			for (let i = 0; i < records.length; i++) {
				if (used.has(i)) continue;
				const rt = time(records[i].timestamp);
				if (Number.isNaN(rt)) continue;
				if (records[i].name === info.name && Math.abs(rt - t) <= WINDOW_MS) {
					used.add(i);
					rows.push({ ...records[i], raw: false });
					merged = true;
					break;
				}
			}
		}
		if (!merged) rows.push({ version: 1, name: info.name ?? "(cleared)", by: "user", timestamp: info.timestamp, raw: true });
	}
	for (let i = 0; i < records.length; i++) {
		if (!used.has(i)) rows.push({ ...records[i], raw: false });
	}
	rows.sort((a, b) => time(a.timestamp) - time(b.timestamp));
	return rows;
}

/** One-line render of a history row, e.g. "2026-10-22 09:11  agent/agent-tool        Rename Work". */
export function formatNameHistoryRow(row: { timestamp: string; by: string; via?: string; model?: string; name: string }): string {
	const date = row.timestamp ? row.timestamp.slice(0, 16).replace("T", " ") : "unknown-time";
	const via = row.via ? `/${row.via}` : "";
	const model = row.model ? ` (${row.model})` : "";
	const who = `${row.by}${via}${model}`.padEnd(34);
	return `${date}  ${who}  ${row.name}`.replace(/\s+$/, "");
}

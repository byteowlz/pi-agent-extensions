import { randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { lstat, mkdir, open, rename, unlink } from "node:fs/promises";
import { join, resolve } from "node:path";
import { withProcessLock } from "./file-lock.js";
import type { SelectionRecord } from "./model.js";
import { emptyAnswers, normalizeSpec, validateAnswers, validateNormalized } from "./validation.js";

const queues = new Map<string, Promise<unknown>>();
export class SelectionStore {
	readonly root: string;
	constructor(root: string) {
		this.root = resolve(root);
	}
	private async init() {
		await mkdir(this.root, { recursive: true, mode: 0o700 });
		const st = await lstat(this.root);
		if (!st.isDirectory() || st.isSymbolicLink() || (st.mode & 0o777) !== 0o700 || st.uid !== process.getuid?.())
			throw new Error("Storage root must be privately owned (0700)");
	}
	private path(id: string) {
		if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id)) throw new Error("Invalid record ID");
		return join(this.root, `${id}.json`);
	}
	private async locked<T>(id: string, fn: () => Promise<T>): Promise<T> {
		await this.init();
		const key = this.path(id);
		const previous = queues.get(key) ?? Promise.resolve();
		const job = previous.catch(() => undefined).then(() => withProcessLock(`${key}.lock`, fn));
		queues.set(key, job);
		try {
			return await job;
		} finally {
			if (queues.get(key) === job) queues.delete(key);
		}
	}
	private async write(record: SelectionRecord) {
		const serialized = JSON.stringify(record);
		if (Buffer.byteLength(serialized) > 4_000_000) throw new Error("Record too large");
		const target = this.path(record.id);
		const tmp = join(this.root, `${randomUUID()}.tmp`);
		try {
			const f = await open(tmp, "wx", 0o600);
			try {
				await f.writeFile(serialized);
				await f.sync();
			} finally {
				await f.close();
			}
			await rename(tmp, target);
			const dir = await open(this.root, "r");
			try {
				await dir.sync();
			} finally {
				await dir.close();
			}
		} finally {
			await unlink(tmp).catch((error: NodeJS.ErrnoException) => {
				if (error.code !== "ENOENT") throw error;
			});
		}
	}
	async create(scopeId: string, spec: unknown): Promise<SelectionRecord> {
		if (typeof scopeId !== "string" || !scopeId || scopeId.length > 4096) throw new Error("Invalid scope");
		const normalized = normalizeSpec(spec);
		const now = new Date().toISOString();
		const record: SelectionRecord = {
			version: 1,
			id: randomUUID(),
			scopeId,
			revision: 0,
			state: "draft",
			spec: normalized,
			answers: emptyAnswers(normalized),
			createdAt: now,
			updatedAt: now,
		};
		return this.locked(record.id, async () => {
			await this.write(record);
			return record;
		});
	}
	async get(id: string, scopeId: string): Promise<SelectionRecord> {
		await this.init();
		const f = await open(this.path(id), constants.O_RDONLY | constants.O_NOFOLLOW);
		let value: unknown;
		try {
			const st = await f.stat();
			if (!st.isFile() || st.size > 4_000_000 || (st.mode & 0o777) !== 0o600 || st.uid !== process.getuid?.())
				throw new Error("Invalid private file");
			value = JSON.parse(await f.readFile("utf8"));
		} finally {
			await f.close();
		}
		const r = value as SelectionRecord;
		if (
			r &&
			typeof r === "object" &&
			Object.keys(r).some(
				(key) => !["version", "id", "scopeId", "revision", "state", "spec", "answers", "createdAt", "updatedAt"].includes(key)
			)
		)
			throw new Error("Unexpected record fields");
		if (
			!r ||
			r.version !== 1 ||
			r.id !== id ||
			r.scopeId !== scopeId ||
			!Number.isSafeInteger(r.revision) ||
			r.revision < 0 ||
			!["draft", "submitted", "cancelled"].includes(r.state) ||
			typeof r.createdAt !== "string" ||
			typeof r.updatedAt !== "string" ||
			!Number.isFinite(Date.parse(r.createdAt)) ||
			!Number.isFinite(Date.parse(r.updatedAt))
		)
			throw new Error("Invalid record or scope");
		const spec = validateNormalized(r.spec);
		const answers = validateAnswers(spec, r.answers, r.state === "submitted");
		return { ...r, spec, answers };
	}
	async update(id: string, scopeId: string, revision: number, answers: unknown, submit: boolean): Promise<SelectionRecord> {
		return this.locked(id, async () => {
			const r = await this.get(id, scopeId);
			if (r.state !== "draft") throw new Error("Terminal record");
			if (r.revision !== revision) throw new Error("Revision conflict");
			const next = {
				...r,
				answers: validateAnswers(r.spec, answers, submit),
				revision: r.revision + 1,
				state: submit ? ("submitted" as const) : ("draft" as const),
				updatedAt: new Date().toISOString(),
			};
			await this.write(next);
			return next;
		});
	}
	async cancel(id: string, scopeId: string, revision?: number, answers?: unknown): Promise<SelectionRecord> {
		return this.locked(id, async () => {
			const r = await this.get(id, scopeId);
			if (revision !== undefined && revision !== r.revision) throw new Error("Revision conflict");
			if (r.state !== "draft") throw new Error("Terminal record");
			const next = {
				...r,
				...(answers === undefined ? {} : { answers: validateAnswers(r.spec, answers, false) }),
				state: "cancelled" as const,
				revision: r.revision + 1,
				updatedAt: new Date().toISOString(),
			};
			await this.write(next);
			return next;
		});
	}
}

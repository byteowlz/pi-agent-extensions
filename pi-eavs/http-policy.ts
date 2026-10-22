import { randomUUID } from "node:crypto";
import {
	closeSync,
	lstatSync,
	mkdirSync,
	openSync,
	readFileSync,
	renameSync,
	statSync,
	unlinkSync,
	writeFileSync,
} from "node:fs";
import { dirname } from "node:path";

const invalid = () => new Error("EAVS HTTP exception configuration unavailable or invalid; no request sent.");

function configOrigins(value: unknown): string[] {
	if (!value || typeof value !== "object" || Array.isArray(value)) throw invalid();
	const config = value as Record<string, unknown>;
	if (Object.keys(config).some((key) => key !== "allowHttpOrigins")) throw invalid();
	const entries = config.allowHttpOrigins ?? [];
	if (!Array.isArray(entries) || entries.length > 128) throw invalid();
	const origins = entries.map((entry) => {
		if (typeof entry !== "string" || entry.length > 2048 || entry.includes("*")) throw invalid();
		let url: URL;
		try {
			url = new URL(entry);
		} catch {
			throw invalid();
		}
		if (url.protocol !== "http:" || url.username || url.password || url.search || url.hash || url.origin !== entry)
			throw invalid();
		return entry;
	});
	return [...new Set(origins)];
}

/** User-controlled exact origins only. No cwd discovery, interpolation or commands.
 * Omit path for an isolated in-memory policy (tests/embedded providers).
 */
export class HttpPolicy {
	private readonly once = new Set<string>();
	constructor(private readonly path?: string) {}
	private saved(): string[] {
		if (!this.path) return [];
		try {
			if (statSync(this.path).size > 64 * 1024) throw invalid();
			return configOrigins(JSON.parse(readFileSync(this.path, "utf8")));
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
			throw invalid();
		}
	}
	origins(): string[] {
		return [...new Set([...this.saved(), ...this.once])];
	}
	allowOnce(origin: string): void {
		configOrigins({ allowHttpOrigins: [origin] });
		this.once.add(origin);
	}
	revokeOnce(origin: string): void {
		this.once.delete(origin);
	}
	clear(): void {
		this.once.clear();
	}
	save(origin: string, signal: AbortSignal): void {
		configOrigins({ allowHttpOrigins: [origin] });
		signal.throwIfAborted();
		if (!this.path) throw invalid();
		const lock = `${this.path}.lock`;
		const temp = `${this.path}.${randomUUID()}.tmp`;
		let fd: number | undefined;
		try {
			mkdirSync(dirname(this.path), { recursive: true, mode: 0o700 });
			fd = openSync(lock, "wx", 0o600);
			// Do not replace a managed config symlink behind the user's back.
			try {
				if (lstatSync(this.path).isSymbolicLink()) throw invalid();
			} catch (error) {
				if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
			}
			const origins = configOrigins({ allowHttpOrigins: [...this.saved(), origin] });
			signal.throwIfAborted();
			const content = `${JSON.stringify({ allowHttpOrigins: origins }, null, 2)}\n`;
			if (Buffer.byteLength(content) > 64 * 1024) throw invalid();
			writeFileSync(temp, content, { mode: 0o600, flag: "wx" });
			signal.throwIfAborted();
			renameSync(temp, this.path);
		} catch {
			throw invalid();
		} finally {
			try {
				unlinkSync(temp);
			} catch {
				/* no partial file */
			}
			if (fd !== undefined) {
				closeSync(fd);
				unlinkSync(lock);
			}
		}
	}
}

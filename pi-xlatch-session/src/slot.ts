import { randomUUID } from "node:crypto";
import * as fs from "node:fs";
import * as net from "node:net";

export function processAlive(pid: number): boolean {
	if (!Number.isSafeInteger(pid) || pid <= 0) return true;
	try {
		process.kill(pid, 0);
		return true;
	} catch (error) {
		return (error as NodeJS.ErrnoException).code !== "ESRCH";
	}
}

type SocketState = "live" | "unreachable" | "unknown";

function socketState(socket: string): Promise<SocketState> {
	return new Promise((resolve) => {
		const probe = net.connect(socket);
		const timer = setTimeout(() => finish("unknown"), 1000);
		const finish = (state: SocketState) => {
			clearTimeout(timer);
			probe.destroy();
			resolve(state);
		};
		probe.once("connect", () => finish("live"));
		probe.once("error", (error: NodeJS.ErrnoException) =>
			finish(error.code === "ENOENT" || error.code === "ECONNREFUSED" ? "unreachable" : "unknown")
		);
	});
}

export async function socketLive(socket: string): Promise<boolean> {
	return (await socketState(socket)) === "live";
}

/** Explicit human recovery of a missing/refused private route, independent of reused PIDs. */
export async function recoverSocket(socket: string): Promise<void> {
	const lock = `${socket}.reclaim`;
	const fd = fs.openSync(lock, "wx", 0o600);
	try {
		fs.writeSync(fd, String(process.pid));
		let original: fs.Stats;
		try {
			original = fs.lstatSync(socket);
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
			throw error;
		}
		if (!original.isSymbolicLink() || !/^\/tmp\/xlp-[^/]+\/\d+\.sock$/.test(fs.readlinkSync(socket))) {
			throw new Error("This is not a managed private slot route. Disconnect its owner or choose a new slot name.");
		}
		if ((await socketState(socket)) !== "unreachable") {
			throw new Error(
				"The slot is reachable or its state is uncertain. Its route was preserved; disconnect its owning session first."
			);
		}
		const current = fs.lstatSync(socket);
		if (current.ino !== original.ino || current.dev !== original.dev) {
			throw new Error("The slot changed during recovery. Its new route was preserved; retry status.");
		}
		fs.unlinkSync(socket);
	} finally {
		fs.closeSync(fd);
		fs.unlinkSync(lock);
	}
}

/** Bind privately: Node's close() unlinks its bound path even after replacement. */
export class SlotEndpoint {
	private closed = false;
	readonly token = randomUUID();
	readonly directory = fs.mkdtempSync("/tmp/xlp-");
	readonly socket = `${this.directory}/${process.pid}.sock`;
	constructor(readonly publicPath: string) {
		fs.chmodSync(this.directory, 0o700);
	}

	ownsAlias(): boolean {
		try {
			return fs.readlinkSync(this.publicPath) === this.socket;
		} catch {
			return false;
		}
	}

	/** Exclusive publication never replaces another owner's route. */
	publish(): void {
		fs.symlinkSync(this.socket, this.publicPath);
	}

	async healthy(server: net.Server): Promise<boolean> {
		if (this.closed || !server.listening || !(await socketLive(this.socket))) return false;
		if (this.closed || !server.listening) return false;
		if (!this.ownsAlias()) {
			try {
				this.publish();
			} catch {
				return false;
			}
		}
		return this.ownsAlias() && (await socketLive(this.publicPath));
	}

	close(server: net.Server): void {
		this.closed = true;
		if (this.ownsAlias()) fs.unlinkSync(this.publicPath);
		server.close(() => {
			fs.rmSync(this.directory, { recursive: true, force: true });
		});
	}
}

/** Only proven-dead owners may be reclaimed; timeouts never justify unlinking. */
export function removeDeadSocket(socket: string, legacyPid?: number): void {
	const lock = `${socket}.reclaim`;
	let fd: number;
	try {
		fd = fs.openSync(lock, "wx", 0o600);
	} catch {
		throw new Error(
			"Slot reclamation is already in progress. Retry; if a crashed process left a .reclaim file, remove that file after verifying its owner exited."
		);
	}
	try {
		fs.writeSync(fd, String(process.pid));
		removeDeadSocketLocked(socket, legacyPid);
	} finally {
		fs.closeSync(fd);
		fs.unlinkSync(lock);
	}
}

function removeDeadSocketLocked(socket: string, legacyPid?: number): void {
	let stat: fs.Stats;
	try {
		stat = fs.lstatSync(socket);
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
		throw error;
	}
	let pid = legacyPid;
	if (stat.isSymbolicLink()) {
		const match = /^\/tmp\/xlp-[^/]+\/(\d+)\.sock$/.exec(fs.readlinkSync(socket));
		pid = match ? Number(match[1]) : undefined;
	}
	if (pid === undefined || processAlive(pid))
		throw new Error("Slot owner is alive or unknown; refusing to replace its socket. Disconnect it in the owning session first.");
	const current = fs.lstatSync(socket);
	if (current.ino !== stat.ino || current.dev !== stat.dev) throw new Error("Slot changed while checking ownership. Try again.");
	fs.unlinkSync(socket);
}

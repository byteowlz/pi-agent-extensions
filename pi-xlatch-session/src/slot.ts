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

export function socketLive(socket: string): Promise<boolean> {
	return new Promise((resolve) => {
		const probe = net.connect(socket);
		const timer = setTimeout(() => finish(false), 1000);
		const finish = (live: boolean) => {
			clearTimeout(timer);
			probe.destroy();
			resolve(live);
		};
		probe.once("connect", () => finish(true));
		probe.once("error", () => finish(false));
	});
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

import { statSync } from "node:fs";
import { createConnection } from "node:net";

/** Endpoint identity is cache hygiene, not authentication or key authorization. */
export function socketIdentity(path: string): string | undefined {
	try {
		const stat = statSync(path);
		return stat.isSocket() ? `${stat.dev}:${stat.ino}` : undefined;
	} catch {
		return undefined;
	}
}

/** Bounded SSH-agent REQUEST_IDENTITIES round trip. Empty agents are live.
 * A policy proxy's SSH_AGENT_FAILURE also proves liveness; it must never cause
 * fallback to an unrestricted agent. No key material or passphrase is sent. */
export function probeAgent(path: string, timeoutMs = 1500): Promise<boolean> {
	return new Promise((resolve) => {
		let done = false;
		let received = Buffer.alloc(0);
		let socket: ReturnType<typeof createConnection>;
		const finish = (alive: boolean) => {
			if (done) return;
			done = true;
			clearTimeout(timer);
			socket?.destroy();
			resolve(alive);
		};
		const timer = setTimeout(() => finish(false), timeoutMs);
		try {
			socket = createConnection({ path });
		} catch {
			finish(false);
			return;
		}
		socket.once("error", () => finish(false));
		socket.once("close", () => finish(false));
		socket.once("connect", () => socket.write(Buffer.from([0, 0, 0, 1, 11])));
		socket.on("data", (chunk) => {
			if (done) return;
			if (received.length + chunk.length > 1_048_580) {
				finish(false);
				return;
			}
			received = Buffer.concat([received, chunk]);
			if (received.length < 4) return;
			const size = received.readUInt32BE(0);
			if (size < 1 || size > 1_048_576) {
				finish(false);
				return;
			}
			if (received.length < size + 4) return;
			const type = received[4];
			finish((type === 5 && size === 1) || (type === 12 && size >= 5));
		});
	});
}

/**
 * xlatch-session — expose ONE running pi session as a dynamic xlatch share action.
 *
 * Architecture
 *   iPhone share sheet
 *     -> xlatch daemon (user mode, same UID)
 *     -> command adapter  ~/.pi/agent/xlatch-pi/adapter.py  (stdin JSON)
 *     -> private Unix socket  ~/.pi/agent/xlatch-pi/slots/<slot>.sock  (0600)
 *     -> this extension -> pi.sendUserMessage(...)  -> ack back to the phone
 *
 * Session binding
 *   The manifest pins `--socket <abs path>` in its fixed args, so an action
 *   always addresses exactly one slot. Shared content carries no session
 *   selector and the adapter ignores any socket/session field in the payload.
 *   A "slot" is a stable named mailbox; a session claims it with /xlatch.
 *   Because the manifest bytes are stable, the revision digest is stable, so a
 *   slot is approved and granted once and reused by any session afterwards.
 *
 * Delivery
 *   Idle  -> pi.sendUserMessage(text) delivers immediately and triggers a turn.
 *   Busy  -> deliverAs "followUp" queues until the current turn's tools finish.
 *   (sendUserMessage throws if the agent is streaming and deliverAs is absent.)
 */

import { execFile } from "node:child_process";
import * as fs from "node:fs";
import * as net from "node:net";
import * as os from "node:os";
import * as path from "node:path";
import { promisify } from "node:util";
import type { ExtensionAPI, ExtensionCommandContext, ExtensionContext } from "@earendil-works/pi-coding-agent";

import { SlotEndpoint, removeDeadSocket, socketLive } from "./src/slot.js";

const execFileAsync = promisify(execFile);

const ROOT = path.join(os.homedir(), ".pi", "agent", "xlatch-pi");
const SLOT_DIR = path.join(ROOT, "slots");
const INCOMING = path.join(os.homedir(), "xlatch", "incoming");
const MANIFEST_DIR = path.join(ROOT, "manifests");
const ADAPTER = path.join(ROOT, "adapter.py");
const CLAIMS = path.join(ROOT, "claims.json");
const STATE_ENTRY = "xlatch-session-slot";
const SLOT_RE = /^[a-z0-9][a-z0-9_-]{0,31}$/;

/** What the adapter forwards over the socket. */
interface SharePayload {
	kind?: string;
	mime_type?: string | null;
	text?: string;
	path?: string;
	name?: string;
	bytes?: number;
	file_mime_type?: string | null;
	note?: string | null;
}

/** One entry of `xlatch list --json`. */
interface CapabilityRecord {
	status?: string;
	revision?: string;
	manifest?: {
		id?: string;
		execution?: { sha256?: string };
	};
}

function errorMessage(err: unknown): string {
	return err instanceof Error ? err.message : String(err);
}

interface Claim {
	token?: string;
	sessionId: string;
	pid: number;
	cwd: string;
	sessionName?: string;
}

function readClaims(): Record<string, Claim> {
	try {
		return JSON.parse(fs.readFileSync(CLAIMS, "utf8"));
	} catch {
		return {};
	}
}

function writeClaims(claims: Record<string, Claim>): void {
	fs.mkdirSync(ROOT, { recursive: true });
	fs.writeFileSync(CLAIMS, JSON.stringify(claims, null, 2), { mode: 0o600 });
}

function slotSocket(slot: string): string {
	return path.join(SLOT_DIR, `${slot}.sock`);
}

function manifestPath(slot: string): string {
	return path.join(MANIFEST_DIR, `${slot}.json`);
}

function adapterSha256(): string {
	const { createHash } = require("node:crypto");
	return createHash("sha256").update(fs.readFileSync(ADAPTER)).digest("hex");
}

function buildManifest(slot: string) {
	return {
		id: `pi.send.${slot}`,
		title: `Send to pi (${slot})`,
		description: `Deliver shared text or a link to the pi session currently connected to the ${slot} slot.`,
		accepts: ["text/plain", "text/uri-list", "image/*", "audio/*", "video/*", "application/pdf", "application/octet-stream"],
		input_schema: {
			type: "object",
			required: ["mime_type"],
			properties: {
				text: { type: "string" },
				mime_type: { type: "string" },
				file: {
					type: "object",
					required: ["name", "data_base64"],
					properties: {
						name: { type: "string" },
						mime_type: { type: "string" },
						data_base64: { type: "string" },
					},
					additionalProperties: false,
				},
			},
			additionalProperties: false,
		},
		output_schema: { type: "object" },
		execution: {
			kind: "command",
			program: ADAPTER,
			// Destination is fixed here, never supplied by the phone.
			args: ["--socket", slotSocket(slot), "--dir", INCOMING],
			sha256: adapterSha256(),
		},
		timeout_seconds: 60,
	};
}

async function registerSlot(slot: string): Promise<{ id: string; revision?: string; status?: string }> {
	fs.mkdirSync(MANIFEST_DIR, { recursive: true });
	const file = manifestPath(slot);
	// Stable bytes => stable revision => approve/grant once per slot.
	fs.writeFileSync(file, `${JSON.stringify(buildManifest(slot), null, 2)}\n`);
	const { stdout } = await execFileAsync("xlatch", ["register", file, "--json"], { maxBuffer: 4 * 1024 * 1024 });
	try {
		const parsed = JSON.parse(stdout);
		return { id: `pi.send.${slot}`, revision: parsed?.revision, status: parsed?.status };
	} catch {
		return { id: `pi.send.${slot}` };
	}
}

/** Reachability is diagnostic only: never prune another session after a timeout. */
async function unavailableSlots(keep?: string): Promise<string[]> {
	const unavailable: string[] = [];
	for (const slot of Object.keys(readClaims())) {
		if (slot !== keep && !(await socketLive(slotSocket(slot)))) unavailable.push(slot);
	}
	return unavailable;
}

/** The slot this session last held, from its own persisted state entries. */
function lastClaimedSlot(ctx: ExtensionContext): string | undefined {
	const entries = ctx.sessionManager.getEntries();
	for (let i = entries.length - 1; i >= 0; i--) {
		const entry = entries[i];
		if (entry?.type === "custom" && entry.customType === STATE_ENTRY) {
			return (entry.data as { slot?: string | null } | undefined)?.slot ?? undefined;
		}
	}
	return undefined;
}

/** Registrations pinning an adapter digest that no longer matches disk. */
async function staleRegistrations(): Promise<string[]> {
	try {
		const live = adapterSha256();
		const { stdout } = await execFileAsync("xlatch", ["list", "--json"], { maxBuffer: 4 * 1024 * 1024 });
		return JSON.parse(stdout)
			.filter((c: CapabilityRecord) => {
				const sha = c.manifest?.execution?.sha256;
				return c.manifest?.id?.startsWith("pi.send.") && sha && sha !== live;
			})
			.map((c: CapabilityRecord) => `${c.manifest?.id} (${c.status})`);
	} catch {
		return [];
	}
}

function createShareServer(handle: (payload: SharePayload) => unknown): net.Server {
	return net.createServer((conn) => {
		let buf = "";
		let consumed = false;
		conn.setEncoding("utf8");
		const reply = (obj: unknown) => {
			try {
				conn.write(`${JSON.stringify(obj)}\n`);
			} catch {
				/* peer gone */
			}
			conn.end();
		};
		conn.on("data", (chunk) => {
			if (consumed) return;
			buf += chunk;
			if (buf.length > 512 * 1024) return reply({ ok: false, error: "payload too large" });
			const nl = buf.indexOf("\n");
			if (nl === -1) return;
			consumed = true;
			let payload: SharePayload;
			try {
				payload = JSON.parse(buf.slice(0, nl));
			} catch {
				return reply({ ok: false, error: "malformed payload" });
			}
			reply(handle(payload));
		});
		conn.on("error", () => conn.destroy());
		setTimeout(() => conn.destroy(), 20_000).unref?.();
	});
}

export default function xlatchSession(pi: ExtensionAPI) {
	let server: net.Server | undefined;
	let boundSlot: string | undefined;
	let ctxRef: ExtensionContext | undefined;
	let received = 0;
	let endpoint: SlotEndpoint | undefined;
	let healthy = false;
	let checking = false;
	let generation = 0;
	let connecting = false;
	let healthTimer: ReturnType<typeof setInterval> | undefined;

	const setStatus = () => {
		ctxRef?.ui.setStatus(
			"xlatch",
			boundSlot ? `xlatch:${boundSlot}${healthy ? "" : " (offline)"}${received ? ` (${received})` : ""}` : undefined
		);
	};

	async function checkHealth(): Promise<void> {
		const current = endpoint;
		const listener = server;
		if (!current || !listener || checking) return;
		checking = true;
		try {
			const reachable = await current.healthy(listener);
			if (current !== endpoint) return;
			if (healthy && !reachable)
				ctxRef?.ui.notify("xlatch connection lost. Shares cannot reach this session; use /xlatch status.", "warning");
			if (!healthy && reachable) ctxRef?.ui.notify("xlatch connection restored.", "info");
			healthy = reachable;
			setStatus();
		} catch (error) {
			if (current === endpoint) {
				healthy = false;
				setStatus();
				ctxRef?.ui.notify(`xlatch health check failed: ${errorMessage(error)}`, "warning");
			}
		} finally {
			checking = false;
		}
	}

	function deliver(payload: SharePayload): { ok: boolean; text?: string; error?: string; delivery?: string } {
		let label: string;
		let body: string;

		if (payload?.kind === "file" && typeof payload.path === "string") {
			const kb = Math.max(1, Math.round((payload.bytes ?? 0) / 1024));
			const note = typeof payload.note === "string" ? payload.note.trim() : "";
			label = note ? "file + note" : "file";
			body = [
				"Shared from phone via xlatch (file), saved to disk:",
				"",
				payload.path,
				"",
				`(${payload.file_mime_type ?? "unknown type"}, ~${kb} KB)`,
				...(note ? ["", "Note from the sender:", "", note] : []),
			].join("\n");
		} else if (payload?.kind === "text" && typeof payload.text === "string" && payload.text.trim()) {
			label = payload.mime_type === "text/uri-list" ? "link" : "text";
			body = `Shared from phone via xlatch (${label}):\n\n${payload.text.trim()}`;
		} else {
			return { ok: false, error: "Nothing shareable was received." };
		}

		const idle = ctxRef?.isIdle() !== false;

		try {
			// followUp queues safely while streaming; when idle this delivers now
			// and triggers a turn. Omitting deliverAs while streaming throws.
			pi.sendUserMessage(body, { deliverAs: "followUp" });
		} catch (err) {
			return { ok: false, error: `pi refused the message: ${errorMessage(err)}` };
		}

		received += 1;
		setStatus();

		return {
			ok: true,
			delivery: idle ? "immediate" : "queued",
			text: idle
				? `Delivered ${label} to pi (${boundSlot}); the session is responding now.`
				: `Queued ${label} for pi (${boundSlot}); the session is busy and will pick it up next.`,
		};
	}

	async function claim(slot: string, ctx: ExtensionContext): Promise<string> {
		if (!SLOT_RE.test(slot)) {
			throw new Error("Slot must be lowercase letters, digits, '-' or '_' (max 32 chars).");
		}
		if (boundSlot || connecting) {
			throw new Error(`This session already holds slot "${boundSlot}". Disconnect first.`);
		}

		const sock = slotSocket(slot);
		fs.mkdirSync(SLOT_DIR, { recursive: true, mode: 0o700 });

		removeDeadSocket(sock, readClaims()[slot]?.pid);
		const owned = new SlotEndpoint(sock);
		const epoch = generation;
		connecting = true;
		const srv = createShareServer((payload) => {
			if (generation !== epoch || endpoint !== owned || !owned.ownsAlias()) {
				return { ok: false, error: "Session connection changed; retry the share." };
			}
			return { ...deliver(payload), session: ctx.sessionManager.getSessionName() ?? ctx.sessionManager.getSessionId() };
		});

		try {
			await new Promise<void>((resolve, reject) => {
				srv.once("error", reject);
				srv.listen(owned.socket, resolve);
			});
			if (epoch !== generation) throw new Error("Connection cancelled by a session change.");
			fs.chmodSync(owned.socket, 0o600);
			owned.publish();
		} catch (error) {
			owned.close(srv);
			throw error;
		} finally {
			connecting = false;
		}
		endpoint = owned;
		healthy = true;
		healthTimer = setInterval(() => {
			void checkHealth();
		}, 3000);
		healthTimer.unref?.();
		srv.on("error", (error) => {
			if (endpoint !== owned) return;
			healthy = false;
			setStatus();
			ctxRef?.ui.notify(`xlatch listener failed: ${errorMessage(error)}`, "error");
		});
		srv.on("close", () => {
			if (endpoint === owned) {
				healthy = false;
				setStatus();
			}
		});

		server = srv;
		boundSlot = slot;
		received = 0;

		const claims = readClaims();
		claims[slot] = {
			token: owned.token,
			sessionId: ctx.sessionManager.getSessionId(),
			pid: process.pid,
			cwd: ctx.cwd,
			sessionName: ctx.sessionManager.getSessionName(),
		};
		writeClaims(claims);
		pi.appendEntry(STATE_ENTRY, { slot });
		setStatus();

		let reg: Awaited<ReturnType<typeof registerSlot>>;
		try {
			reg = await registerSlot(slot);
		} catch (error) {
			if (endpoint === owned) release();
			throw error;
		}
		if (endpoint !== owned) throw new Error("Connection changed during registration.");
		await checkHealth();
		if (!healthy) throw new Error("The session socket is unavailable. Run /xlatch status.");
		return [
			`Connected this session to xlatch slot "${slot}".`,
			`  action:   ${reg.id}`,
			`  revision: ${reg.revision ?? "(see xlatch list)"}`,
			`  status:   ${reg.status ?? "pending"}`,
			"",
			reg.status === "active"
				? "Already approved — share from the phone now."
				: [
						"Approve and grant (one time per slot):",
						`  xlatch approve ${reg.id} --revision ${reg.revision ?? "REV"} --allow-host-execution`,
						`  xlatch grant <DEVICE_ID> ${reg.id} --revision ${reg.revision ?? "REV"}`,
						"With an approver device configured, approve in the iOS app instead: Server -> Action approvals.",
					].join("\n"),
		].join("\n");
	}

	function release(explicit = false): string | undefined {
		generation += 1;
		clearInterval(healthTimer);
		healthTimer = undefined;
		const slot = boundSlot;
		const owned = endpoint;
		const listener = server;
		endpoint = undefined;
		server = undefined;
		boundSlot = undefined;
		healthy = false;
		if (owned && listener) owned.close(listener);
		if (slot && owned) {
			const claims = readClaims();
			if (claims[slot]?.token === owned.token) {
				delete claims[slot];
				writeClaims(claims);
			}
		}
		if (explicit) pi.appendEntry(STATE_ENTRY, { slot: null });
		setStatus();
		return slot;
	}

	pi.on("session_start", (event, ctx) => {
		ctxRef = ctx;
		setStatus();
		// /reload and resume both re-enter here after release(); restore the link
		// so the phone target does not silently disappear.
		// A new or forked session must never inherit its parent's slot.
		const mayRestore = event.reason === "reload" || event.reason === "startup" || event.reason === "resume";
		const epoch = generation;
		void (async () => {
			if (boundSlot || !mayRestore || epoch !== generation) return;
			const prior = lastClaimedSlot(ctx);
			if (!prior) return;
			// On /reload this handler can run while the previous instance still
			// holds the socket, so poll briefly instead of bailing on first look.
			for (let attempt = 0; attempt < 8; attempt++) {
				if (boundSlot || epoch !== generation) return;
				if (!(await socketLive(slotSocket(prior)))) {
					try {
						await claim(prior, ctx);
						ctx.ui.notify(`xlatch: reconnected slot "${prior}".`, "info");
					} catch (error) {
						ctx.ui.notify(`xlatch could not reconnect "${prior}": ${errorMessage(error)}`, "warning");
					}
					return;
				}
				await new Promise((r) => setTimeout(r, 400));
			}
			if (epoch === generation) ctx.ui.notify(`xlatch slot "${prior}" is held by another session; not reconnected.`, "warning");
		})();
	});

	pi.on("session_shutdown", () => {
		release();
	});

	async function connectTo(slot: string, ctx: ExtensionCommandContext): Promise<void> {
		try {
			ctx.ui.notify(await claim(slot, ctx), "info");
		} catch (err) {
			ctx.ui.notify(`xlatch connect failed: ${errorMessage(err)}`, "error");
		}
	}

	function disconnect(ctx: ExtensionCommandContext): void {
		const was = release(true);
		ctx.ui.notify(was ? `Disconnected from xlatch slot "${was}".` : "This session is not connected.", "info");
	}

	async function showStatus(ctx: ExtensionCommandContext, unavailable: string[]): Promise<void> {
		await checkHealth();
		const others = Object.entries(readClaims()).filter(([s]) => s !== boundSlot);
		const stale = await staleRegistrations();
		const lines = [
			boundSlot
				? `This session: ${healthy ? "connected" : "OFFLINE"} to "${boundSlot}" (${received} received)`
				: "This session: not connected",
			others.length
				? `Other registered slots: ${others.map(([s, c]) => `${s} (pid ${c.pid})`).join(", ")}`
				: "Other registered slots: none",
			...(unavailable.length ? [`Unreachable slots: ${unavailable.join(", ")}`] : []),
			...(stale.length
				? [
						"",
						`Stale registrations (adapter changed since approval): ${stale.join(", ")}`,
						"Reconnect that slot to re-register it.",
					]
				: []),
			"",
			"Run `xlatch list` to see action status (pending/active).",
		];
		ctx.ui.notify(lines.join("\n"), "info");
	}

	pi.registerCommand("xlatch", {
		description: "Connect or disconnect this pi session as an xlatch share target for your phone.",
		handler: async (args, ctx) => {
			ctxRef = ctx;
			const arg = (args ?? "").trim();

			// Direct forms: /xlatch <slot> | /xlatch off
			if (arg === "off" || arg === "disconnect") return disconnect(ctx);
			if (arg && arg !== "status" && arg !== "connect") return connectTo(arg, ctx);

			const pruned = await unavailableSlots(boundSlot);
			if (arg === "status") return showStatus(ctx, pruned);

			const choice = await ctx.ui.select("xlatch", [
				boundSlot ? `Disconnect  (currently "${boundSlot}")` : "Connect this session to a slot",
				"Status",
				"Cancel",
			]);
			if (!choice || choice === "Cancel") return;
			if (choice === "Status") return showStatus(ctx, pruned);
			if (choice.startsWith("Disconnect")) return disconnect(ctx);

			const slot = await ctx.ui.input("Slot name", "e.g. govnr");
			if (slot?.trim()) await connectTo(slot.trim(), ctx);
		},
	});
}

import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, test } from "node:test";
import type { ExtensionAPI, ExtensionCommandContext, ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { PresentationBinding, PresentationQuery } from "../pi-capabilities/contract.js";
import selection from "./index.js";
import type { Answers, SelectionRecord, TuiOutcome } from "./model.js";
import { discoverPresentations } from "./presentation.js";
import { type RuntimePresenters, SelectionRuntime } from "./runtime.js";
import { SelectionStore } from "./store.js";

const spec = { version: 1, mode: "questions", title: "Test", questions: [{ id: "q", title: "Q", kind: "text" }] };
const answers: Answers = { q: { answered: true, selectedIds: [], text: "preserved" } };
const roots: string[] = [];
afterEach(async () => {
	await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});
async function root(): Promise<string> {
	const value = await mkdtemp(join(tmpdir(), "selection-runtime-"));
	roots.push(value);
	return value;
}
function deferred<T>() {
	let resolve: (value: T) => void = () => {
		throw new Error("Not initialized");
	};
	const promise = new Promise<T>((done) => {
		resolve = done;
	});
	return { promise, resolve };
}
function host(expiresAt = Date.now() + 60_000): PresentationBinding {
	return { id: "host", clientKind: "other-rpc", capabilities: ["selection.questions.v1"], expiresAt };
}
function harness() {
	let scope = "session";
	let bindings: readonly PresentationBinding[] = [];
	let onPresent = (_record: SelectionRecord) => {
		/* No renderer unless a test installs one. */
	};
	const statuses: { key: string; value?: string }[] = [];
	const notifications: string[] = [];
	const commands = new Map<string, { handler(args: string, ctx: ExtensionCommandContext): Promise<void> }>();
	const lifecycle = new Map<string, (event: unknown, ctx: ExtensionContext) => Promise<void>>();
	const flags = new Map<string, string>();
	let chatCalls = 0;
	const pi = {
		events: {
			emit(name: string, payload: unknown) {
				if (name === "pi-capabilities:query/v1") {
					const query = payload as PresentationQuery;
					query.reply({ version: 1, scopeId: query.scopeId, bindings });
				}
				if (name === "pi-selection:present/v1") onPresent((payload as { review: SelectionRecord }).review);
			},
		},
		registerFlag() {
			/* Flags are supplied by this harness. */
		},
		getFlag(name: string) {
			return flags.get(name) ?? (name === "selection-browser-ttl-ms" ? "1000" : "");
		},
		registerTool() {
			/* These tests invoke the runtime or control commands. */
		},
		registerCommand(name: string, command: { handler(args: string, ctx: ExtensionCommandContext): Promise<void> }) {
			commands.set(name, command);
		},
		on(name: string, handler: (event: unknown, ctx: ExtensionContext) => Promise<void>) {
			lifecycle.set(name, handler);
		},
		sendMessage() {
			chatCalls++;
		},
		sendUserMessage() {
			chatCalls++;
		},
		appendEntry() {
			chatCalls++;
		},
	} as unknown as ExtensionAPI;
	const ctx = {
		mode: "rpc",
		signal: undefined,
		sessionManager: { getSessionId: () => scope },
		ui: {
			setStatus(key: string, value?: string) {
				statuses.push({ key, value });
			},
			notify(text: string) {
				notifications.push(text);
			},
		},
	} as unknown as ExtensionCommandContext;
	return {
		pi,
		ctx,
		statuses,
		notifications,
		commands,
		lifecycle,
		flags,
		setScope(value: string) {
			scope = value;
		},
		setBindings(value: readonly PresentationBinding[]) {
			bindings = value;
		},
		setPresent(fn: typeof onPresent) {
			onPresent = fn;
		},
		chatCalls: () => chatCalls,
	};
}
async function fixture() {
	const h = harness();
	let closes = 0;
	let starts = 0;
	let tuiCalls = 0;
	let outcome: TuiOutcome = { action: "cancel", answers };
	const presenters: RuntimePresenters = {
		async browser() {
			starts++;
			return {
				url: "http://mock/#token",
				address: "mock",
				port: 1,
				async close() {
					closes++;
				},
			};
		},
		async tui() {
			tuiCalls++;
			return outcome;
		},
	};
	const runtime = new SelectionRuntime(h.pi, { root: await root(), browserTtlMs: 25 }, presenters);
	return {
		...h,
		runtime,
		presenters,
		closes: () => closes,
		starts: () => starts,
		tuiCalls: () => tuiCalls,
		setOutcome(value: TuiOutcome) {
			outcome = value;
		},
	};
}

test("cancelled TUI answers use one atomic revision CAS and never update first", async () => {
	const f = await fixture();
	f.ctx.mode = "tui";
	f.runtime.store.update = async () => {
		throw new Error("Non-atomic update");
	};
	const result = await f.runtime.execute(f.ctx, { action: "create", spec });
	assert.equal(result.record.state, "cancelled");
	assert.equal(result.record.revision, 1);
	assert.deepEqual(result.record.answers, answers);
	assert.deepEqual((await f.runtime.store.get(result.record.id, "session")).answers, answers);
});

test("reopened TUI completion closes an existing browser presentation", async () => {
	const f = await fixture();
	const initial = await f.runtime.execute(f.ctx, { action: "create", spec, presentation: "browser" });
	f.ctx.mode = "tui";
	const finished = await f.runtime.execute(f.ctx, { action: "open", id: initial.record.id });
	assert.equal(finished.record.state, "cancelled");
	assert.equal(f.closes(), 1);
	await f.runtime.reset();
	assert.equal(f.closes(), 1);
});

test("cancel CAS conflicts preserve concurrent host answers", async () => {
	const f = await fixture();
	f.ctx.mode = "tui";
	let id = "";
	f.presenters.tui = async (_ctx, record) => {
		id = record.id;
		await f.runtime.store.update(id, "session", 0, { q: { ...answers.q, text: "concurrent" } }, false);
		return { action: "cancel", answers };
	};
	await assert.rejects(f.runtime.execute(f.ctx, { action: "create", spec }), /Revision conflict/);
	const saved = await f.runtime.store.get(id, "session");
	assert.equal(saved.state, "draft");
	assert.equal(saved.answers.q.text, "concurrent");
});

test("routing prefers native TUI, explicit binding bypasses it, absent provider rejects host", async () => {
	const f = await fixture();
	f.ctx.mode = "tui";
	f.setBindings([host()]);
	await f.runtime.execute(f.ctx, { action: "create", spec });
	assert.equal(f.tuiCalls(), 1);
	const result = await f.runtime.execute(f.ctx, { action: "create", spec, bindingId: "host" });
	assert.equal(result.presentation.kind, "host");
	assert.equal(f.starts(), 0);
	f.setBindings([]);
	await assert.rejects(f.runtime.execute(f.ctx, { action: "create", spec, presentation: "host" }), /No live binding/);
	await f.runtime.reset();
});

test("acknowledged explicit host disconnect and lease expiry stop ask with draft intact", async () => {
	for (const expire of [false, true]) {
		const f = await fixture();
		f.setBindings([host()]);
		let id = "";
		f.setPresent((record) => {
			id = record.id;
			void f.runtime.acknowledge(f.ctx, id, "host");
			f.setBindings(expire ? [host(Date.now() - 1)] : []);
		});
		await assert.rejects(
			f.runtime.execute(f.ctx, { action: "ask", spec, presentation: "host" }),
			/disconnected or lease expired/
		);
		assert.equal((await f.runtime.store.get(id, "session")).state, "draft");
		assert.equal(f.starts(), 0);
	}
});

test("auto host disconnect falls back, browser TTL bounds wait and closes resource", async () => {
	const f = await fixture();
	f.setBindings([host()]);
	f.setPresent((record) => {
		void f.runtime.acknowledge(f.ctx, record.id, "host");
		f.setBindings([]);
	});
	const kinds: string[] = [];
	await assert.rejects(
		f.runtime.execute(f.ctx, { action: "ask", spec }, undefined, (result) => kinds.push(result.presentation.kind)),
		/expired/
	);
	assert.deepEqual(kinds, ["host", "browser"]);
	assert.equal(f.starts(), 1);
	assert.equal(f.closes(), 1);
});

test("claims never bypass scope checks and ack requires a live matching schema", async () => {
	const f = await fixture();
	f.setBindings([host()]);
	const result = await f.runtime.execute(f.ctx, { action: "create", spec, presentation: "host" });
	f.setBindings([{ ...host(), capabilities: ["selection.review.v1"] }]);
	await assert.rejects(f.runtime.acknowledge(f.ctx, result.record.id, "host"), /expired presentation binding/);
	f.setScope("other-session");
	f.setBindings([host()]);
	await assert.rejects(f.runtime.saveFromHost(f.ctx, result.record.id, 0, answers, true), /scope/);
	await assert.rejects(f.runtime.acknowledge(f.ctx, result.record.id, "host"), /expired presentation binding/);
	assert.equal((await f.runtime.store.get(result.record.id, "session")).revision, 0);
	await f.runtime.reset();
});

test("unacknowledged explicit host times out without launching browser", async () => {
	const f = await fixture();
	f.setBindings([host()]);
	await assert.rejects(f.runtime.execute(f.ctx, { action: "ask", spec, bindingId: "host" }), /did not acknowledge/);
	assert.equal(f.starts(), 0);
});

test("reset wakes host wait immediately and stale TUI callback cannot save", async () => {
	const f = await fixture();
	f.setBindings([host()]);
	const presented = deferred<void>();
	f.setPresent(() => presented.resolve());
	const waiting = f.runtime.execute(f.ctx, { action: "ask", spec, presentation: "host" });
	const rejected = assert.rejects(waiting, /abort|cancel|session changed/i);
	await presented.promise;
	await f.runtime.reset();
	await rejected;
	f.ctx.mode = "tui";
	const shown = deferred<SelectionRecord>();
	const answer = deferred<TuiOutcome>();
	f.presenters.tui = async (_ctx, record) => {
		shown.resolve(record);
		return answer.promise;
	};
	const old = f.runtime.execute(f.ctx, { action: "create", spec });
	const oldRejected = assert.rejects(old, /cancel|session changed/i);
	const record = await shown.promise;
	await f.runtime.reset();
	answer.resolve({ action: "cancel", answers });
	await oldRejected;
	assert.equal((await f.runtime.store.get(record.id, "session")).revision, 0);
});

test("late browser startup is closed after reset; abort and scope changes fence callbacks", async () => {
	const f = await fixture();
	const started = deferred<void>();
	const browser = deferred<Awaited<ReturnType<RuntimePresenters["browser"]>>>();
	let closed = 0;
	f.presenters.browser = async () => {
		started.resolve();
		return browser.promise;
	};
	const request = f.runtime.execute(f.ctx, { action: "create", spec, presentation: "browser" });
	const rejected = assert.rejects(request, /cancel|session changed/i);
	await started.promise;
	await f.runtime.reset();
	browser.resolve({
		url: "mock",
		address: "mock",
		port: 1,
		async close() {
			closed++;
		},
	});
	await rejected;
	assert.equal(closed, 1);
	f.ctx.mode = "tui";
	f.presenters.tui = async () => {
		f.setScope("other");
		return { action: "submit", answers };
	};
	await assert.rejects(f.runtime.execute(f.ctx, { action: "create", spec }), /session changed/);
	const abort = new AbortController();
	abort.abort();
	await assert.rejects(f.runtime.execute(f.ctx, { action: "create", spec }, abort.signal), /cancel/);
});

test("reset attempts all browser cleanup even when one close fails and remains idempotent", async () => {
	const f = await fixture();
	let closed = 0;
	f.presenters.browser = async () => ({
		url: "mock",
		address: "mock",
		port: 1,
		async close() {
			closed++;
			if (closed === 1) throw new Error("close failed");
		},
	});
	await f.runtime.execute(f.ctx, { action: "create", spec, presentation: "browser" });
	await f.runtime.execute(f.ctx, { action: "create", spec, presentation: "browser" });
	await assert.rejects(f.runtime.reset(), /close failed/);
	assert.equal(closed, 2);
	await f.runtime.reset();
	assert.equal(closed, 2);
});

test("presentation query is synchronous, optional, scope/expiry filtered and copies capabilities", () => {
	const h = harness();
	assert.deepEqual(discoverPresentations(h.pi, "session"), []);
	h.setBindings([host(Date.now() - 1), host()]);
	const result = discoverPresentations(h.pi, "session");
	assert.equal(result.length, 1);
	let query: PresentationQuery | undefined;
	const pi = {
		events: {
			emit(_name: string, body: unknown) {
				query = body as PresentationQuery;
				query.reply({ version: 1, scopeId: "wrong", bindings: [host()] });
			},
		},
	} as unknown as ExtensionAPI;
	const ignored = discoverPresentations(pi, "session");
	assert.deepEqual(ignored, []);
	query?.reply({ version: 1, scopeId: "session", bindings: [host()] });
	assert.deepEqual(ignored, []);
});

test("stale control success/error callbacks after lifecycle reset never publish replies", async () => {
	const h = harness();
	h.flags.set("selection-state-dir", await root());
	selection(h.pi);
	const command = h.commands.get("selection-create");
	assert.ok(command);
	const original = SelectionStore.prototype.create;
	try {
		for (const fail of [false, true]) {
			const entered = deferred<void>();
			const release = deferred<void>();
			SelectionStore.prototype.create = async function (scope, value) {
				entered.resolve();
				await release.promise;
				if (fail) throw new Error("late error");
				return original.call(this, scope, value);
			};
			const pending = command.handler(JSON.stringify({ version: 1, requestId: "stale", spec, presentation: "none" }), h.ctx);
			await entered.promise;
			const reset = h.lifecycle.get("session_tree");
			assert.ok(reset);
			await reset({}, h.ctx);
			const count = h.statuses.length;
			release.resolve();
			await pending;
			assert.equal(h.statuses.length, count);
		}
	} finally {
		SelectionStore.prototype.create = original;
	}
	assert.equal(h.chatCalls(), 0);
});

test("all control failures are correlated replies, never chat/entries; success and lifecycle clear status", async () => {
	const h = harness();
	h.flags.set("selection-state-dir", await root());
	selection(h.pi);
	for (const [name, command] of h.commands) {
		await command.handler(JSON.stringify({ version: 1, requestId: name }), h.ctx);
		const payload = JSON.parse(h.statuses.at(-1)?.value ?? "{}");
		assert.equal(payload.requestId, name);
		assert.equal(payload.command, name);
		assert.equal(payload.ok, false);
		assert.equal(typeof payload.error, "string");
	}
	const command = h.commands.get("selection-create");
	assert.ok(command);
	for (const args of [
		JSON.stringify({ version: 2, requestId: "bad-version" }),
		"{",
		JSON.stringify({ version: 1, requestId: "bad-mode", presentation: "invalid" }),
	]) {
		await command.handler(args, h.ctx);
		const payload = JSON.parse(h.statuses.at(-1)?.value ?? "{}");
		assert.equal(payload.ok, false);
		if (args !== "{") assert.equal(payload.requestId, JSON.parse(args).requestId);
	}
	await command.handler(JSON.stringify({ version: 1, requestId: "good", spec, presentation: "none" }), h.ctx);
	assert.equal(JSON.parse(h.statuses.at(-1)?.value ?? "{}").ok, true);
	assert.equal(h.chatCalls(), 0);
	for (const handler of h.lifecycle.values()) await handler({}, h.ctx);
	assert.equal(h.statuses.at(-1)?.value, undefined);
});

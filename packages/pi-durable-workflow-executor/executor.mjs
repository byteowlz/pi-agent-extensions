import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { StringDecoder } from "node:string_decoder";
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import {
	AssistantEntry,
	GenerationTask,
	Harness,
	createRegistry,
	defineDoc,
	defineExtension,
	hook,
} from "@earendil-works/pi-durable";
import { openNodeJsonlStorage } from "@earendil-works/pi-durable/storage/jsonl/node";
import { validateReviewedProposal } from "./dist/core.js";

const Binding = defineDoc({
	kind: "byteowlz.workflow-binding",
	version: 1,
	scope: "conversation",
	history: "latest",
	fork: "initial",
	initial: () => ({ proposalId: "", revision: 0, digest: "", occurrences: {} }),
});
export const capabilities = {
	schemaVersion: 1,
	runtime: "pi-durable@1.0.4",
	contextMode: "bounded-text-instructions-not-history-import",
	tools: [],
	qualification: true,
	scheduling: false,
	productionAuthorityBound: false,
};
function denied(code, message) {
	return { ok: false, code, message, effects: "none", recurrenceActive: false };
}

/**
 * Trusted HOST adapter seam, not an agent-callable grant API. The CLI binds no
 * production authority. Never supply a self-approving callback to unattended jobs.
 * v1 runs NO tools/generated code. Native history/checkpoints remain SDK-owned.
 */
export async function runOccurrence(proposal, occurrenceId, adapters) {
	const reviewed = await validateReviewedProposal(proposal);
	if (!reviewed.ok) return denied("review_invalid", "A matching reviewed version is required.");
	if (!adapters?.authorize || !adapters?.models || !adapters?.storeDir)
		return denied("authority_unavailable", "Protected host authority/models/store binding is required.");
	if (typeof occurrenceId !== "string" || !/^[a-zA-Z0-9:_-]{1,200}$/.test(occurrenceId))
		return denied("occurrence_invalid", "An opaque bounded occurrence id is required.");
	const p = reviewed.value;
	if (p.definition.tools.length || p.definition.artifacts.length)
		return denied("confinement_unavailable", "Generated/custom tools cannot run without a qualified confinement adapter.");
	// Approval UX is not authority. Adapter must bind current grants/job revision/target.
	let grant;
	try {
		grant = await adapters.authorize({ proposal: p, occurrenceId, phase: "admit" });
	} catch {
		return denied("admission_unavailable", "Host authority could not verify this occurrence.");
	}
	if (grant?.approved !== true) return denied("admission_denied", "Host admission denied this occurrence.");
	const context = adapters.context ?? BACKGROUND_CONTEXT;
	let harness;
	let lock;
	let effects = false;
	const key = `occurrence:${occurrenceId}`;
	try {
		effects = true;
		await mkdir(adapters.storeDir, { recursive: true, mode: 0o700 });
		// OS-released on crash. Durable itself has no cross-process ownership lock.
		lock = new DatabaseSync(join(adapters.storeDir, "ownership.sqlite"));
		lock.exec("CREATE TABLE IF NOT EXISTS lease (id INTEGER PRIMARY KEY)");
		lock.exec("BEGIN IMMEDIATE");
		effects = true;
		let requestGrant;
		const guard = defineExtension({
			name: "workflow-host-admission",
			hooks: [
				hook(GenerationTask, {
					async beforeRequest(_request, api) {
						requestGrant = undefined;
						const current = await adapters.authorize({
							proposal: p,
							occurrenceId,
							phase: "request",
							conversationId: api.conversationId,
							taskId: api.taskId,
						});
						if (current?.approved === true) requestGrant = { conversationId: api.conversationId, taskId: api.taskId };
					},
				}),
			],
		});
		// Durable 1.0.4 REPORTS hook errors and continues. Throwing in a hook is
		// NOT admission enforcement. Gate the actual model transport, consuming
		// a fresh phase grant; missing/failed hooks therefore fail closed.
		const securedModels = new Proxy(adapters.models, {
			get(target, name) {
				const value = Reflect.get(target, name, target);
				if (name === "fetchDeferred")
					return () => {
						throw new Error("Deferred polling requires a qualified phase-admission adapter.");
					};
				if (name === "streamSimple" || name === "stream")
					return (...args) => {
						const allowed = requestGrant;
						requestGrant = undefined;
						if (!allowed) throw new Error("Host authority denied the native request or recovery.");
						if (args[0].provider !== p.definition.model.provider || args[0].id !== p.definition.model.id)
							throw new Error("Requested native model differs from approved model.");
						return value.apply(target, args);
					};
				return typeof value === "function" ? value.bind(target) : value;
			},
		});
		const registry = createRegistry();
		registry.install(guard);
		harness = await Harness.open(
			await openNodeJsonlStorage(join(adapters.storeDir, "native"), context, { fsync: true }),
			{
				models: securedModels,
				registry,
				settings: {
					retry: { maxRetries: 0 },
					stream: { timeoutMs: p.definition.limits.maxDurationMs },
					compaction: { enabled: false },
				},
			},
			context
		);
		const root = await harness.root(context, {
			agent: {
				model: { provider: p.definition.model.provider, modelId: p.definition.model.id },
				tools: [],
				extensions: [guard],
				instructions: `This is a new durable workflow conversation, not recovery of an ordinary execution checkpoint. Historical priming below is a bounded text projection; tool calls must not be replayed. No tools or subagent capabilities are installed.\n\n${p.definition.source.context}`,
			},
		});
		await root.commit(async (tx) => {
			const state = await tx.doc(Binding, root.id);
			if (state.digest && (state.digest !== p.digest || state.proposalId !== p.id || state.revision !== p.revision))
				throw new Error("Native conversation is bound to another workflow version; explicit new admission is required.");
			if (!state.digest) {
				state.proposalId = p.id;
				state.revision = p.revision;
				state.digest = p.digest;
			}
			if (!state.occurrences[key] && Object.keys(state.occurrences).length >= p.definition.limits.maxRuns)
				throw new Error("Approved run limit reached.");
			state.occurrences[key] ??= { submissionId: "", status: "admitted" };
		}, context);
		const submission = await root.submit(
			{
				type: "input",
				content: p.definition.prompt,
				requestId: `workflow:${p.id}:${p.revision}:${occurrenceId}`,
				whenBusy: "reject",
			},
			context
		);
		await root.commit(async (tx) => {
			(await tx.doc(Binding, root.id)).occurrences[key].submissionId = submission.id;
		}, context);
		const settled = await submission.wait(context);
		let text = "";
		if (settled.status === "done" && settled.type === "input") {
			const entry = await root.commit((tx) => tx.entry(AssistantEntry, settled.answer), context);
			text =
				entry?.model
					?.flatMap((message) =>
						message.role === "assistant" ? message.content.filter((part) => part.type === "text").map((part) => part.text) : []
					)
					.join("\n") ?? "";
		}
		await root.commit(async (tx) => {
			(await tx.doc(Binding, root.id)).occurrences[key].status = settled.status;
		}, context);
		const encoded = Buffer.from(text);
		const truncated = encoded.length > p.definition.limits.maxOutputBytes;
		// Keep complete UTF-8 characters; no opaque identity clipping.
		const output = new StringDecoder("utf8").write(encoded.subarray(0, p.definition.limits.maxOutputBytes));
		return {
			ok: settled.status === "done",
			effects: "possible",
			recurrenceActive: false,
			proposalId: p.id,
			revision: p.revision,
			digest: p.digest,
			occurrenceId,
			conversationId: root.id,
			submissionId: submission.id,
			status: settled.status,
			output,
			truncated,
			contextMode: capabilities.contextMode,
			authority: "host-adapter",
			scheduling: "not-bound",
		};
	} catch (error) {
		return {
			ok: false,
			code: "native_execution_failed",
			message: String(error?.message ?? error).slice(0, 1000),
			effects: effects ? "possible" : "none",
			recurrenceActive: false,
		};
	} finally {
		try {
			if (harness) await harness.close(context);
		} finally {
			lock?.close();
		}
	}
}

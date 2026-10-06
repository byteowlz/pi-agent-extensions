#!/usr/bin/env node
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createModels } from "@earendil-works/pi-ai/models";
import { fauxAssistantMessage, fauxProvider } from "@earendil-works/pi-ai/providers/faux";
import { createProposal, reviewProposal, reviseProposal } from "./dist/core.js";
import { capabilities, runOccurrence } from "./executor.mjs";

async function qualify() {
	const dir = await mkdtemp(join(tmpdir(), "workflow-native-"));
	try {
		const faux = fauxProvider();
		const models = createModels();
		models.setProvider(faux.provider);
		const now = new Date().toISOString();
		const draft = await createProposal(
			{
				name: "Synthetic Primed Job",
				prompt: "Return the primed token.",
				intervalMs: 60000,
				source: {
					sessionId: "synthetic-parent",
					cwd: dir,
					entryIds: ["primer"],
					context: "user: Remember token garden. Past tool calls are historical, not execution requests.",
					contextComplete: false,
					droppedEntries: 0,
				},
				model: { provider: "faux", id: "faux-1" },
				tools: [],
				artifacts: [],
				allowSubagents: false,
				limits: { maxRuns: 2, maxDurationMs: 5000, maxOutputBytes: 1000 },
			},
			"synthetic-workflow",
			now
		);
		const approved = reviewProposal(draft, "approved", now);
		const authority = async ({ proposal }) => ({ approved: proposal.digest === approved.digest && proposal.id === approved.id });
		const adapters = { storeDir: join(dir, "store"), models, authorize: authority };
		faux.setResponses([
			() => {
				throw new Error("Unauthorized proposal reached the model");
			},
		]);
		assert.equal((await runOccurrence(draft, "one", adapters)).code, "review_invalid");
		assert.equal((await runOccurrence(approved, "one", {})).code, "authority_unavailable");
		assert.equal(
			(await runOccurrence(approved, "one", { ...adapters, authorize: async () => ({ approved: false }) })).code,
			"admission_denied"
		);
		const revoked = await runOccurrence(approved, "revoked", {
			...adapters,
			storeDir: join(dir, "revoked"),
			authorize: async ({ phase }) => ({ approved: phase === "admit" }),
		});
		assert.equal(revoked.ok, false);
		assert.equal(faux.state.callCount, 0, "Revoked grant must prevent the native model request");
		const response = (context) => {
			assert(
				JSON.stringify(context.messages).includes("Remember token garden"),
				"The actual native request must contain approved priming"
			);
			assert.equal(context.tools?.length ?? 0, 0, "No tools or subagents may be installed in qualification");
			return fauxAssistantMessage("garden");
		};
		faux.setResponses([response, response]);
		const first = await runOccurrence(approved, "one", adapters);
		assert.equal(first.ok, true, JSON.stringify(first));
		assert.equal(first.output, "garden");
		const duplicate = await runOccurrence(approved, "one", adapters);
		assert.equal(duplicate.submissionId, first.submissionId);
		assert.equal(faux.state.callCount, 1);
		const second = await runOccurrence(approved, "two", adapters);
		assert.equal(second.ok, true, JSON.stringify(second));
		assert.equal(second.output, "garden");
		assert.equal(second.conversationId, first.conversationId);
		assert.equal(faux.state.callCount, 2);
		const exceeded = await runOccurrence(approved, "three", adapters);
		assert.equal(exceeded.ok, false);
		assert.match(exceeded.message, /run limit/);
		const changed = reviewProposal(
			await reviseProposal(approved, { ...approved.definition, prompt: "Changed" }, now),
			"approved",
			now
		);
		const mismatch = await runOccurrence(changed, "four", { ...adapters, authorize: async () => ({ approved: true }) });
		assert.equal(mismatch.ok, false);
		assert.match(mismatch.message, /another workflow version/);
		return {
			ok: true,
			runtime: capabilities.runtime,
			nativePrimingVerified: true,
			occurrences: 2,
			duplicateAdmissionVerified: true,
			reopenVerified: true,
			frozenVersionVerified: true,
			requestRevocationVerified: true,
			runLimitVerified: true,
			toolCount: 0,
			recurrenceActive: false,
			productionAuthorityBound: false,
		};
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
}
try {
	const command = process.argv[2] ?? "help";
	if (command === "capabilities") console.log(JSON.stringify(capabilities));
	else if (command === "qualify") console.log(JSON.stringify(await qualify()));
	else if (command === "help" || command === "--help")
		console.log(
			"pi-durable-workflow executor: capabilities | qualify\nQualification uses disposable native storage and a synthetic provider. Production run/schedule adapters are not bound."
		);
	else {
		console.error("Unsupported command; production execution and scheduling are not bound.");
		process.exitCode = 2;
	}
} catch (error) {
	console.error(String(error?.message ?? error));
	process.exitCode = 1;
}

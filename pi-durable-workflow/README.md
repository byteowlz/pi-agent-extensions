# pi-durable-workflow

Experimental first slice: portable workflow intent, human review, and isolated native Durable qualification. **It does not enable live recurrence.**

Load `pi-durable-workflow/index.ts` from the canonical collection checkout (keep `packages/pi-durable-workflow-core` alongside it). Ordinary Pi SDK dependencies remain 1.0.0; the native executor has its own isolated 1.0.4 dependencies.

## Pi surface

```
/workflow propose 30m Summarize the primed context
/workflow list
/workflow inspect <id>
/workflow review <id>
/workflow revoke <id>
```

The `workflow` tool supports those actions plus `activate`. Propose opens human **Y/N/Edit** review in TUI/RPC; headless calls create drafts only. Editing resets the review and increments the revision. Approval is a descriptive review record, **not execution authority**. `activate` always fails closed with `adapter_unavailable`.

Defaults: no requested tools, subagents false, ten admitted runs, five-minute model-stream timeout, 16 KB output. The editor allows intent/tools/subagent preference/limits edits but cannot replace the source identity or model. Limits are intent, not a verified OS resource sandbox. At most eight proposals per session. Stored custom entries are session-owned; side/fork sessions do not inherit proposals. Session changes invalidate outstanding dialogs/queued operations.

Priming is a bounded 24 KB/200-entry **text projection** of user/assistant text and compaction summaries. Attachments, system sections and execution state are not imported. `contextComplete:false` and omission counts are explicit. Historical tool calls are never replayed. This does not import native historical transcript records or recover ordinary in-flight checkpoints.

## Portable core

`packages/pi-durable-workflow-core` is independent of Pi ExtensionAPI/TUI. It validates definitions, canonical SHA-256 digests, revisions, reviews, bounded snapshots and receipts. Tampered definitions invalidate even a cached matching review digest. See its README for exact bounds and APIs.

## Native executor qualification

```
cd packages/pi-durable-workflow-executor
npm ci --ignore-scripts
npm run build
node cli.mjs capabilities
node cli.mjs qualify
```

Use Node >=24.14.1. Build requires Bun. Qualification uses a synthetic provider and disposable native JSONL/fsync storage; it sends no private history and creates no schedule. It proves actual native priming, two occurrences in the same conversation, deduplication across reopen, frozen version/run limits, and denied authorization with zero provider calls.

`runOccurrence()` is a **trusted-host library seam**, not an agent-callable grant API. A protected host supplies models, storage identity and authorization; the standalone CLI binds no production authority. No tools/generated code execute; tools/artifacts fail closed until confinement is qualified. Host authorization is rechecked before actual model transport, including generation recovery. Deferred polling is unsupported. SQLite provides an OS-released single-writer lease; native checkpoints/history remain SDK-owned.

Important SDK behavior: Durable1.0.4 hook exceptions are reported and ignored. Throwing from `beforeRequest` does not block a provider. The executor consumes a fresh phase grant at the transport boundary; missing/failed hooks deny transport. Permission tests assert **zero provider calls**, not merely a failure receipt.

Reopen and dedup are verified; abrupt-crash/power-loss and hard resource/sandbox guarantees are **not** qualified. Native task/input identity, not exactly-once external effects, is deduplicated. Native storage contains source text/output; the trusted host must protect its directory and avoid untrusted same-UID writers.

## Remaining production work

- Protected, revocable account/workspace/session/job grants and pinned artifact/runtime admission.
- Qualified restricted-tool builder, positive/denied tests, manual trial and reapproval for material changes. Never execute model-authored privileged code.
- Thin skdlr admission adapter; Durable executes/recoveries, runner supervises wake/ownership. No duplicate scheduler.
- Tick identity, no overlap/catch-up storms, pause/cancel/busy/missed-tick semantics and run/cost limits.
- Active-timer session-local subagent guard (default deny, explicitly approved override); approval must not mutate global subagent config. No timer is active in this slice, so no existing children/settings are changed.
- Authorized Oqto adapter, native context-import capability and separately fenced same-public-session cutover. Ordinary Pi and native Durable storage remain separate.

These interfaces remain unbound rather than inventing authority or sandbox guarantees.

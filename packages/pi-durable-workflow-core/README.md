# pi-durable-workflow-core

Portable, **dependency-free** core for durable workflow proposals.

This package implements the pure domain model for reviewing and approving
recurring workflow definitions that a Pi session may want to run. It has **no
runtime dependencies at all**: it imports nothing from Pi (`@earendil-works/pi-*`)
and no `node:*` modules. It only relies on WebCrypto (`globalThis.crypto.subtle`)
for SHA-256, which is available in Bun, browsers, and Node >= 18.

## What it does

- **Validates** a `WorkflowDefinition` strictly (types, safe integers, bounds).
- **Hashes** it into a canonical SHA-256 `digest` (key-order independent).
- **Creates / revises / reviews / revokes** `WorkflowProposal` objects.
- **Verifies execution authority** via `validateReviewedProposal`.
- **Projects** a bounded `publicSnapshot` that never leaks source context.
- **Parses** human intervals into milliseconds.
- **Builds** explicit effect-typed `WorkflowReceipt`s for adapters.

## What it does NOT do (by design)

- **Never executes** a workflow, schedules it, or runs a timer.
- **Never calls models** or any external service.
- **Never grants tool access.** A definition may *request* tools, but this core
  exposes the list only as intent; an adapter decides authorization.
- **Never touches permissions, files, or the scheduler.**
- **No arbitrary code execution.**

## Important limitations

- This is the **portable core only**. It defines the domain model and its rules.
  The Pi extension, executor, and scheduling live elsewhere.
- **Validation, not enforcement.** `validateReviewedProposal` proves that a
  proposal is *currently, exactly* approved (state `approved`, review digest ==
  proposal digest, and digest re-computed from the definition). That is the
  *authority* an adapter may act on — but the adapter must still enforce
  permissions and never rely on the core to grant access.
- **A description/review never grants authority.** Merely having a review object
  is not enough; it must be `approved` and its digest must exactly match the
  current definition digest.
- **Subagents are never enabled by default** (`allowSubagents` defaults to
  `false`). Setting it to `true` is an intent signal only.
- **Reviews are invalidated by any revision.** `reviseProposal` resets state to
  `draft`, removes the review, and bumps `revision`, so a stale approval cannot
  carry over.
- The digest uses **WebCrypto**, so this package requires an environment where
  `crypto.subtle` exists. There is no Node fallback by design (build-only
  solution keeps it portable).

## Bounds / caps (v1)

| Field | Bound |
| --- | --- |
| `name` | 120 chars |
| `prompt` | 8,000 UTF-8 bytes |
| `source.context` | 64,000 UTF-8 bytes |
| `tools` / `artifacts` / `entryIds` | 64 / 64 / 512 items |
| `limits.maxRuns` | 1–1,000 |
| `limits.maxDurationMs` | 1 – 3,600,000 (1h) |
| `limits.maxOutputBytes` | 1 – 32,000 |
| `intervalMs` | 60,000 (1m) – 31,536,000,000 (365d) |
| public snapshot JSON | ≤ 16,000 UTF-8 bytes (`SNAPSHOT_MAX_JSON_BYTES`) |
| receipt `note` | ≤ 1,600 UTF-8 bytes (`RECEIPT_NOTE_MAX_BYTES`) |

All bounds are enforced strictly and with safe integers; string bounds for
`prompt`/`context` are measured in UTF-8 bytes (so multi-byte characters count
more than one).

## API

```ts
// Types
import type {
	WorkflowDefinition, WorkflowProposal, WorkflowReview, WorkflowReceipt,
	WorkflowSnapshot, ValidationResult, ProposalState, ReviewDecision, ReceiptEffect,
} from "./index.ts";

// Constants
import {
	PROPOSAL_SCHEMA_VERSION,
	MIN_INTERVAL_MS,
	MAX_INTERVAL_MS,
	SNAPSHOT_MAX_JSON_BYTES,
	RECEIPT_NOTE_MAX_BYTES,
} from "./index.ts";

// Functions
import {
	validateDefinition,            // unknown -> ValidationResult<WorkflowDefinition>
	definitionDigest,              // async unknown -> sha256 hex string
	createProposal,                // async (definition, id, now) -> WorkflowProposal
	reviseProposal,                // async (proposal, definition, now) -> WorkflowProposal
	reviewProposal,                // (proposal, 'approved'|'rejected', now) -> WorkflowProposal
	revokeProposal,                // (proposal) -> WorkflowProposal
	validateReviewedProposal,      // async (proposal) -> ValidationResult<WorkflowProposal>
	publicSnapshot,                // (proposal) -> WorkflowSnapshot
	parseInterval,                 // '30m' | '2h' | '1d' | '90 seconds' -> ms (throws)
	createReceipt,                 // (proposal, effect, note?) -> WorkflowReceipt
} from "./index.ts";
```

## Development

```bash
bun install
bun test          # run the Bun test suite
bun run typecheck # tsgo type checking
```

No runtime deps; `@types/bun` and `tsgo` are dev-only for type checking.
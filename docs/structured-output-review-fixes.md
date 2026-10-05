# Structured-output review fixes (2.3.1)

Based on exact cecc341 (SDK1.0.0), isolated branch `review/structured-output-node-cecc341`. Issues piext-4b0n.7/.8/.9/.10. This is source qualification, not integration/publication/deployment approval.

## Changes

- Shared kyz matching vocabulary for final and streaming paths includes raw, base64, URI and standard JSON-escaped known values up to three nested encodings. Lone-surrogate URI errors do not disable raw/JSON redaction. Stream cuts preserve unrelated surrogate pairs. No arbitrary-encoding DLP claim.
- Subagent activity is checked before each retry/after backoff against both abort and Session identity. Backoff and side-effect CLI calls take the signal, CLI calls have bounded timeout/SIGKILL cleanup, and approval receives cancellation. Already-dispatched operations are not falsely rolled back.
- Dispatched tab creation is marked possible before awaiting its result. Failed/lost responses cannot produce effects:none; pre-dispatch denial/cancellation still does. Cancelled receipts are distinguishable.
- Public catalog/list/read projections fit 32,000 UTF-8 serialized JSON bytes. Metadata/list omissions advertise truncation; catalog and list counts remain available. Opaque IDs are retained or an oversized single-read identity fails explicitly. No authoritative persisted state is truncated. Helpers are extension-local to preserve independent packaging.
- Canonical `npm test` discovers the entire test suite so regressions and shared-library tests are not silently omitted. Root version2.3.1; standalone xlatch2.0.1; SDK stays exactly1.0.0. Bun lock stores dependency pins, not root package version, and requires no dependency change.

## Evidence

Exact official Node24.14.1/Pi1 launcher: `/home/wismut/byteowlz/oqto-release-artifacts/pi1-node-qualification/runtime/pi`.

- `bun test`: **323 pass / 0 fail / 1953 assertions / 40 files**.
- `scripts/review-regressions.test.ts`: 11 tests including abort/backoff, Session change, uncertain committed tab, pre-dispatch cancellation, nested JSON/Unicode/chunks, aggregate JSON budget, identity preservation/rejection.
- Native `scripts/test-structured-output-host.mjs <launcher>`: PASS. Raw and standard JSON-encoded fixture credentials absent from codemode, RPC rows, actual host spill files and native JSONL. Private HOME/credentials/service fixtures; no real vault/root/Herdr service called.
- Native `scripts/test-pi-1-catalog.mjs <launcher>`: **25 extensions plus combined catalog** pass actual factories/Session startup/command smoke.
- `npm run check` under pinned Node: no errors/type diagnostics; **39 warnings remain**. Modified output/scrub/budget helpers lint with zero warnings. Repository-wide warnings (including candidate-owned introspection debt) remain an explicit integration gate, not silently accepted debt or warning-free certification. Broad unrelated cleanup was deliberately not mixed into these fixes.
- `git diff --check`: clean.

Detailed logs/reproductions: `/home/wismut/security-audit-skill/pi-agent-extensions/run-1/fix-*`. Original failing proofs retained separately. Delegated independent verification is unavailable (subagents disabled); these are locally reproduced/fixed regressions, not completed independent security certification.

No release/default pin advance, main merge, tag, runtime/config installation, website publication or live service activation. Physical CPU, actual orchestration deployment, full-shell/provider/sandbox acceptance, history UI-thread isolation and contributor-registry work remain separate.

# Structured-output verification snapshot

Branch: plan/codemode-structured-outputs. Base: a9a87c3.
Collection version: 2.3.0; exact Pi SDK 1.0.0 retained. Root package.json/package-lock.json updated with npm version --no-git-tag-version, bun.lock regenerated with bun install --lockfile-only.

Verified on the local implementation snapshot:
- npm run check: exit 0; 39 lint warnings remain, no errors, no type diagnostics.
- bun test: 312 pass, 0 fail, 1922 assertions across 39 files.
- node scripts/test-structured-output-host.mjs: exit 0. Actual exact official Pi 1 native codemode receives structured objects, composes parallel history searches/targeted reads, and tests error/throw, denied privilege, classifier-independent retrieval, deadline cancellation and redaction including spill/persisted data. Synthetic fixtures/local provider only; no live user configuration or privilege execution.

Reconciliation: product main inspected at 32b1c11. History indexer.ts and recall.ts have no base difference; history entry-point TUI mode adaptation is retained. New xlatch arbitrary-file delivery from 32b1c11 applied to integration code, adapter, docs and tests. Its old-main package 1.4.0 version is deliberately not applied over Pi 1 integration's 2.0.0 extension package. Selection/capabilities migration work and exact Pi pins are not overwritten with product-main old SDK state.

Limits: not a product-main merge/deployment approval, not a physical fullscreen responsiveness measurement, not a fix for the history freeze. Optional extension status contributors to introspection are not implemented. Selection's existing permissive schema still requires owner-coordinated refinement. The subagent controller showed working but its local session had no fresh progress and no reachable crosstalk socket at final checks; do not treat that controller label as live execution proof. Finalization was performed by the parent session.

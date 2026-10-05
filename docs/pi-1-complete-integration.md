# Coherent Pi 1 source integration (2.4.1)

Task: piext-4haf. Candidate branch integrate/pi-1-complete starts from product main279f871 and merges feat/session-backends49b8981 (which includes Pi1 baseline/Selection/capabilities plus reviewed structured outputs). Main xlatch file delivery and Todo renderer remain intact. Print-exit fix f8159ae/d92ca9e is adapted to renamed pi-session-tools. Exact Pi AI/coding-agent/TUI dependencies remain1.0.0; package/lockfiles version2.4.1.

## Included

- Maintained/archive split and Pi1 API migration; Selection/capability foundation preserved, no new authorization or Selection schema changes.
- Bounded structured codemode outputs and adversarial review fixes for escaping/redaction, cancellation fences, partial-effect receipts and aggregate JSON budgets.
- pi-session-tools source rename, owner-aware Herdr/tmux routing and tmux side forks; optional pi-introspection contributors and resolved session-tool snapshots.
- Unified /todo controls, collapsed widget and real-theme background-safe width-aware tool results ported into pi-todolist.
- Print-mode socket/reconnect guard and actual process-exit tests updated to renamed tools and dynamic complete maintained-extension discovery (not the old six-extension list).
- Deferred history startup timer cancelled on shutdown/replacement; plain cwd captured before scheduling. Regression forbids disposed context reads.

## Qualification

On coherent candidate:
- npm run check: passes, no type errors. Existing warning debt remains explicitly recorded; not warning-free certification.
- npm test:368 pass/0 fail,2206 assertions across47 files.
- Official prepared host Node24.14.1/Pi1.0.0 runs all four scripts successfully: test-structured-output-host.mjs, test-pi-1-catalog.mjs (25 maintained extensions plus combined catalog), test-selection-rpc.mjs (capabilities off/on), test-selection-tool.mjs.
- Native codemode probe explicitly checks optional pi-session-tools contribution, bounded structured objects, parallel history evidence reads, failure/abort and secret absence in protocol/persisted/spill results.
- Actual print-process tests use a local synthetic SSE provider, temporary HOME and reachable fake Herdr socket. Both session-tools-only and every maintained entry point print the expected answer and exit0.
-25 real-theme Todo truncation regressions retained. New startup shutdown/disposal test passes.

No real credentials/private-history upload, privilege execution, live config/install or Oqto release pin changes. Source main integration is authorized by the user; deployment/remote publication remains separate.

## Explicit remaining work

History SQLite/parsing/scan worker isolation and physical fullscreen responsiveness/latency proof are NOT implemented. Broader tmux subagent lifecycle/navigation/messaging and an authorized Oqto runner adapter remain incomplete; unsupported runner ownership fails closed. Physical CPU/helper and Oqto Web/deployment gates remain separate. Existing collection lint warnings remain debt, not ignored errors. This merges completed source work, not completion of every associated epic.

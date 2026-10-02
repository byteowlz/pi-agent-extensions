# Pi 1 baseline preparation

Branch: `feat/pi-1`; collection version: 2.0.0; runtime/SDK baseline:
exact Pi 1.0.0. This is reviewable migration preparation, not release,
deployment, full callback qualification or upstream publication.

## Scope

- Exact SDK development pins, synchronized npm/Bun locks and Node >=22.19.
- Auto-rename uses the session ModelRegistry for completion, including
  header-only authentication. Request-time authentication stays registry-owned.
- RPC has `hasUI=true` but cannot run custom terminal components. Guard native
  pickers/password prompts by mode; subagent confirmation uses RPC dialogs,
  fails closed without UI unless explicit auto policy is selected, and does
  not inherit native terminal timeout-auto-allow behavior.
- Bridge RPC telemetry is mode-aware and only settlement clears run phase.
  Its pre-existing count-based input-binding path still requires the coordinated
  runner/bridge identity migration. No claim that this path is fixed.
- Rename pi-oqto-todos to pi-todolist while preserving tool names, commands,
  configuration filename, persisted custom-type/widget keys and stored state.
- Apply the saved review: 17 keep, five archived, six unresolved kept active.
  Archived code is preserved outside active discovery and checks/tests.
- Named-value-export regression checks cover all maintained source imports,
  including files marked ts-nocheck. Exact-binary catalog smoke uses disposable
  HOME/project, stripped credentials and stubbed service CLIs, both individually
  and together. It does not execute every tool or prove physical TUI interaction.

## Evidence and remaining gates

Local evidence: `/tmp/oqto-pi-1-evidence/extensions-*.log`. Run:

```sh
npm run check
npm test
npm run test:pi-1 -- /path/to/integrity-verified/pi-1.0.0
```

The legacy lint warnings are explicitly retained debt for this narrow API and
archive preparation: refactoring large unrelated UI/permission state machines
without their physical/lifecycle proofs would widen risk. They remain a blocker
for the parent task's warning-free acceptance; no suppression was added to hide
warnings and no full-ready status is claimed.

Still required: representative callback execution, cancellation/reload/session
switch and grant/egress proof; coordinated runner/history identity fixes;
warning-free acceptance; and immutable Oqto extension ref/list/manifest equality.
Oqto currently pins an older extension snapshot. Its lists must change together
with a published, qualified immutable source ref—not independently to a directory
that does not exist in the old snapshot. No live runtime/config was changed.

Pi selection/capability extensions are separately planned in piext-w6w0. The
ad-hoc tailnet review prototype is not included as a production extension.

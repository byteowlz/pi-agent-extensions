# @byteowlz/runtime-interactions

Host-neutral **consumer** half of the placement-neutral runtime interaction
contract. Safe to import from Oq, oqt (standalone Pi Durable TUI/CLI), mobile and
managed adapters: it contains **no pi, pi-tui, socket, hub, lease or extension
entry** imports.

A **producer** supplies `InteractionPorts` and an `InteractionAdmission`. The
pi-tui-rpc extension is one such producer (personal bridge); a managed Runner or
oqt's own pinned Pi source can implement the same ports.

## Import

```ts
import {
  createInteractionRuntime,   // ports + admission -> canonical RuntimeResponse
  coverageFor,                // the ten mandatory placement rows
  commandPalette,             // terminal views + canonical request builders
  permissionPrompt,
  queueView, queueActionRequest,
  errorView, eventNotice, statusNotice,
  validateRuntimeRequest,     // generated-schema validation
} from "@byteowlz/runtime-interactions";
```

Contents: `mod.ts` (entry), `interaction-port.ts`, `interaction-runtime.ts`,
`interaction-terminal.ts`, `interaction-coverage.ts`, `wire.ts`, and the vendored
canonical DTOs/schemas at `protocol/runtime-interactions/v1` (pinned by
`protocol/runtime-interactions/SOURCE.json`).

## Producer obligations

Return canonical DTOs only; no invented IDs/generations/cursors/receipts.
`permission_decide` is the only decision path and is one-shot; a presenter or
Selection answer is never a grant. Provide honest `binding()`/`permitted()` (the
runtime re-reads them after every await). Omit a port instead of faking it.
Absent ports are unavailable, not silently empty.

## Coverage and evidence

`coverageFor(placement, ports, evidence?)` reports the ten mandatory rows. A
missing port is **not** evidence that Pi lacks an SDK operation: pass
`{ catalog: "sdk_absent", ... }` only when that is known. Defaults are
`adapter_unwired`/`port_not_configured`. Composite rows (`errors_outcomes`,
`reconnect_headless`) stay unavailable until their full paths exist. Placement
parity is diagnostic only.

## oqt constraint

oqt launches upstream Pi Durable TUI from its **own pinned Pi source** and does
not load user extensions. It therefore consumes this package and supplies a
producer port implementation from that source (or a first-party hook). For an extension-hosted personal producer, command catalog and genuine dispatch
are **not** SDK-blocked: registered commands/skills/templates are enumerable and
a catalog-fenced `sendUserMessage(..., {expandPromptTemplates:true})` is genuine
dispatch (receipt `started`, uncertain, never `handled`). Builtins need an
upstream public export of `BUILTIN_SLASH_COMMANDS` plus typed-operation mapping.
The remaining personal SDK gap is **queue read/clear**: `ExtensionContext` has
only `hasPendingMessages()`. oqt is not an extension host, so its own producer
still needs a public in-process API or a first-party hook in its pinned source. Permission menu/decision are blocked by producer
wiring + a Core-qualified domain extension (not the Pi SDK); owner configuration
by a separate owner-write authority; retained notifications by a Core-qualified
DTO; headless by the CLI/recovery implementation.

Packaging: ship `protocol/**` (schemas/transport/fixtures) and `ajv` with the
consumer. No deployment or reload is implied by this package.

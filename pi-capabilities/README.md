# pi-capabilities (protocol v1)

Optional, leased **presentation advertisements**, not authorization. Built against the installed `@earendil-works/pi-coding-agent` **1.0.0** SDK. No model calls, transcript entries, runtime files, config, endpoints, permissions or automatic installation. Native TUI remains a fallback when no advertisement exists.

## Commands

All arguments are strict JSON objects with `version: 1` and optional opaque `requestId`. Unknown fields (including URLs, permission booleans and caller-supplied scope) are rejected. IDs/requestIds are stable tokens matching `[A-Za-z0-9][A-Za-z0-9_.-]{0,127}`; do not include secrets.

```text
/presentation-bind {"version":1,"requestId":"bind-1","id":"web-1","clientKind":"oqto-web","capabilities":["selection.questions.v1","selection.review.v1"],"leaseMs":60000}
/presentation-list {"version":1,"requestId":"list-1"}
/presentation-unbind {"version":1,"requestId":"unbind-1","id":"web-1"}
```

`clientKind`: `oqto-web`, `oqto-desktop`, `pi-tui-rpc`, `other-rpc`.
Capabilities: only `selection.questions.v1`, `selection.review.v1`; an empty set is allowed; duplicates are rejected. Lease is integer milliseconds, 5000..600000 inclusive, default 60000. Binding the same ID replaces its metadata and renews the lease. Unbinding a missing ID succeeds. Scope is always `ctx.sessionManager.getSessionId()`.

RPC replies use `ctx.ui.setStatus('pi-capabilities:reply/v1', JSON.stringify(reply))`. The resulting `extension_ui_request` has `method: "setStatus"`, `statusKey` and JSON `statusText`. Its outer UI ID is **not** the metadata `requestId`.

Success: `{version:1,requestId?,command,ok:true,snapshot}`.
Failure: `{version:1,requestId?,command,ok:false,error:"invalid-request"}`. A valid requestId is preserved even on validation failure. Invalid IDs are not echoed. TUI only notifies a count or a generic validation failure, never raw input, IDs, secrets or URLs. Non-UI modes still handle metadata without output.

## Adapter discovery: never fall through to a model prompt

Before submitting these commands through RPC `prompt`, call `get_commands` and require all three entries with `source: "extension"` (not a template or skill). If unavailable, treat advertisement support as absent and use the native selection fallback; **do not send an unknown slash command to Pi**. Pi can treat an unknown command as a model prompt. Discovery is not atomic with reload; serialize reload/session replacement and metadata submission in the adapter, rediscover after replacement, and fail closed if availability cannot be assured. Checking a response after accidental model dispatch cannot undo it.

Send a discovered command using RPC `prompt` (not `steer` or `follow_up`); subscribe to UI status before sending. Require `data.disposition: "handled"` and the matching metadata acknowledgement with a bounded deadline. A normal RPC success alone does not prove registration succeeded. Missing reply, unexpected disposition, exit, reload or timeout means unavailable/unknown; never retry by converting the command into ordinary text. Correlate concurrent requests with unique requestIds. Metadata acknowledgements are separate from normal RPC response IDs.

## Extension query contract

Consumers import **types only** from `contract.ts`; there is no required runtime import or selection dependency:

```ts
import type { PresentationQuery, PresentationSnapshot } from "../pi-capabilities/contract.ts";
let snapshot: PresentationSnapshot | undefined;
const query: PresentationQuery = {
  version: 1,
  scopeId: ctx.sessionManager.getSessionId(),
  reply: value => { snapshot = value; },
};
pi.events.emit("pi-capabilities:query/v1", query);
// No reply means the optional extension is unavailable.
```

Snapshot: `{version:1,scopeId,bindings:[{id,clientKind,capabilities,expiresAt}]}`. `expiresAt` is Unix epoch milliseconds. Snapshots are detached, deeply frozen copies; expired leases are filtered at query/list/bind time (no timers). Unknown scopes return empty snapshots. Consumers must query the current scope again before routing, not retain an old snapshot across lifecycle changes.

`session_start` clears metadata and installs the bus listener; completed `session_tree` clears it. `session_shutdown` clears all scopes and unregisters the bus listener idempotently. SDK 1.0 emits shutdown with reason `reload` before replacing the runtime and start with reason `reload` afterward; new/resume/fork use the same shutdown/start boundaries. Canceled navigation does not clear bindings. No state is restored from session entries.

## Security boundary

Claims are **only routing hints**. Neither the bus nor a bind command authenticates a client. The frontend/runner must validate an authenticated, current binding before executing a presentation, including ownership/session association, expiry and supported capability. IDs, client kinds and leases confer no permissions; an advertised route must never bypass existing confirmation/security policy. This extension executes no presentation and accepts no endpoint URL.

## Local verification

```sh
bun test pi-capabilities/capabilities.test.ts
./node_modules/.bin/biome check pi-capabilities
```

Only this directory is needed for the extension; no root package changes or installation are performed here.

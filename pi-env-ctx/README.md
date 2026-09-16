# pi-env-ctx

Export `AGENT_CTX_*` metadata (v2 of the schema in `byteowlz/schemas/agent-context-env`) into
`process.env` so spawned tools/commands can identify the active harness, session, model, and —
when running inside herdr — the multiplexer/agent and host layers.

## What this extension sets

This extension owns only the following fields (v2 of the AGENT_CTX contract):

### Harness bag (Pi-native)

- `AGENT_CTX_VERSION=2`
- `AGENT_CTX_HARNESS=pi`
- `AGENT_CTX_HARNESS_SESSION_ID` (current Pi session id)
- `AGENT_CTX_MODEL` (`provider/id`, e.g. `anthropic/claude-3-7-sonnet`)
- `AGENT_CTX_SESSION_NAME` (optional display name, may appear/change later)

### Multiplexer/agent bag (only when `HERDR_ENV === "1"`)

Read herdr's own env directly as the source of truth. Emitted only inside a herdr-managed
pane; otherwise these vars stay **unset**. `AGENT_LABEL` is deliberately skipped this pass
(it needs an async socket call to herdr for the tab/pane title).

- `AGENT_CTX_MULTIPLEXER=herdr`
- `AGENT_CTX_AGENT_ID` = `$HERDR_PANE_ID`
- `AGENT_CTX_AGENT_ADDRESS` = `$HERDR_PANE_ID`
- `AGENT_CTX_WORKSPACE_ID` = `$HERDR_WORKSPACE_ID` (opt)

### Host bag (always emitted, herdr-independent)

- `AGENT_CTX_MACHINE_ID` — herdr machine name if exposed (`HERDR_MACHINE_NAME`) else `os.hostname()`
- `AGENT_CTX_NODE_HOSTNAME` — `os.hostname()`
- `AGENT_CTX_OS_ARCH` — `os/arch` (x64 → amd64), e.g. `darwin/arm64`, `linux/amd64`

Unknown values are left **unset** (not empty strings).

## Mutability and lifecycle

- On `session_start`: initializes all owned vars.
- On `before_agent_start` and `turn_start`: refreshes mutable fields (`AGENT_CTX_HARNESS_SESSION_ID`, `AGENT_CTX_SESSION_NAME`, `AGENT_CTX_MODEL`) before active turn/tool work.
- On `model_select`: updates `AGENT_CTX_MODEL`.
- On `session_tree` and `turn_end`: refreshes `AGENT_CTX_HARNESS_SESSION_ID` and `AGENT_CTX_SESSION_NAME`.
  - This ensures session id/name stay correct when switching to a different session in the same Pi process.

## Ownership boundary

Not owned by this extension (runner/sandbox/platform responsibility):

- `AGENT_CTX_WORKSPACE_PATH` (owned by runner/sandbox wrapper)
- `AGENT_CTX_PLATFORM_*` (`PLATFORM_NAME`, `PLATFORM_VERSION`, `PLATFORM_SESSION_ID`, …)
- `AGENT_CTX_USER_ID`
- `AGENT_CTX_RUN_MODE`
- `AGENT_CTX_REQUEST_ID`, `AGENT_CTX_CORRELATION_ID`
- `AGENT_CTX_AGENT_LABEL` (deferred: needs a socket call to herdr for the tab/pane title)

Out of scope for now (follow-up via pi-oqto-bridge once oqto↔herdr are integrated): the
platform/oqto bag.

## Producer bridging: herdr

v2 follows the producer-map layering (`platform → multiplexer → harness → host`); a bag is
emitted **only when its producing layer is present**. pi-env-ctx currently produces the
harness bag (always), the host bag (always), and the multiplexer/agent bag (only when
`HERDR_ENV === "1"`). Consumers must tolerate snapshots with any combination of bags.

## Security caveat

`AGENT_CTX_*` values are metadata for context/search/routing. They are **not** a security boundary and must not be trusted for authorization.

## Quick verification

After enabling the extension, run:

```bash
node -e 'console.log({
  AGENT_CTX_VERSION: process.env.AGENT_CTX_VERSION,
  AGENT_CTX_HARNESS: process.env.AGENT_CTX_HARNESS,
  AGENT_CTX_HARNESS_SESSION_ID: process.env.AGENT_CTX_HARNESS_SESSION_ID,
  AGENT_CTX_MODEL: process.env.AGENT_CTX_MODEL,
  AGENT_CTX_SESSION_NAME: process.env.AGENT_CTX_SESSION_NAME,
  AGENT_CTX_MULTIPLEXER: process.env.AGENT_CTX_MULTIPLEXER,
  AGENT_CTX_AGENT_ID: process.env.AGENT_CTX_AGENT_ID,
  AGENT_CTX_AGENT_ADDRESS: process.env.AGENT_CTX_AGENT_ADDRESS,
  AGENT_CTX_MACHINE_ID: process.env.AGENT_CTX_MACHINE_ID,
  AGENT_CTX_NODE_HOSTNAME: process.env.AGENT_CTX_NODE_HOSTNAME,
  AGENT_CTX_OS_ARCH: process.env.AGENT_CTX_OS_ARCH,
})'
```

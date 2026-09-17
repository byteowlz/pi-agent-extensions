# pi-tui-rpc

Drive **one** pi session from the TUI and external RPC clients at the same time.

pi's `--mode rpc` and the interactive TUI are mutually exclusive process modes, and two
processes on one session file diverge. This extension runs inside a **TUI-mode** pi process,
opens a Unix-socket JSONL server, and bridges external frontends (oqto) onto the same live
session — the TUI stays fully usable throughout.

> **Spike status (piext-6j02).** This is the bridge-era mechanism for dual frontends. pi 2's
> multiple presentation attachments per Session replace it; keep it disposable behind the
> runner's PiTranslator.

## How it works

```text
herdr pane                     oqto runner                  oqto frontend
┌────────────────┐   unix sock  ┌───────────────────┐        ┌──────────────┐
│ pi (TUI mode) ─┼──────────────┤ PiTranslator      ├─canonical─► rich UI     │
│ + pi-tui-rpc   │              │ (transport choice)│        └──────────────┘
│  input lease:  │              └───────────────────┘
│  TUI ⇄ remote  │
└────────────────┘
```

- **Outbound**: pi extension events (`agent_start/end`, `turn_start/end`,
  `message_start/update/end`, `tool_execution_*`, `model_select`, `thinking_level_select`,
  compaction events, `input`, `session_start/shutdown`) are fanned out to every connected
  client as JSONL frames.
- **Inbound**: a small command set (below). Prompts are injected with
  `pi.sendUserMessage`, so they appear in the TUI as user messages and vice versa — both
  surfaces always show the same conversation.
- **Input lease**: the TUI owns input by default. A remote client takes over only after the
  TUI user confirms a dialog; the TUI can seize input back instantly by just typing. Lease
  changes are broadcast and shown in the TUI status bar.

## Quick start

```bash
pi -e ./pi-tui-rpc/index.ts --no-session
# in another shell:
node pi-tui-rpc/test-client.mjs "$PI_TUI_RPC_SOCKET" \
  --send '{"id":"1","type":"prompt","message":"Reply with exactly: PONG"}' --wait-settled
```

### Model commands

- `get_available_models` → `{ models: [...] }` in pi RPC shape (session-scoped models when configured).
- `set_model { provider, modelId }` → switches the live session's model.
- `set_thinking_level { level }`.

### Lease

Remote lease requests are granted immediately; the terminal revokes on any interactive keystroke. Set `PI_TUI_RPC_LEASE_CONFIRM=1` to require a TUI confirmation.

### Socket path

- `PI_TUI_RPC_SOCKET` env var (set by the oqto runner per session), else
- `${TMPDIR}/pi-tui-rpc-<pid>.sock`.

## Protocol (v0)

Strict JSONL: LF (`\n`) is the only record delimiter; a single trailing `\r` is tolerated.

### Commands (client → extension)

| Command | Fields | Notes |
| --- | --- | --- |
| `prompt` | `message`, `streamingBehavior?` (`steer`\|`followUp`) | Error when streaming without `streamingBehavior` |
| `steer` | `message` | Error when idle |
| `follow_up` | `message` | Error when idle |
| `abort` | — | Requires the lease |
| `get_state` | — | Mode, cwd, session ids/name, model, thinking level, streaming, lease |
| `get_messages` | — | Current branch entries |
| `lease` | `action: request\|release` | Request triggers the TUI confirm dialog |

Responses: `{"type":"response","id":…,"command":…,"success":…,"data"|"error":…}`.

### Events (extension → client)

- `{"type":"hello","v":0,"pid":…,"lease":…}` on connect
- `{"type":"event","event":"<pi event>","data":…,"ts":…}` for fanned-out pi events
- `{"type":"lease","owner":"tui"|"remote","reason":…}` on every ownership change

### Lease rules

- `tui` is the default owner; observation commands (`get_state`, `get_messages`) never need it.
- Input commands (`prompt`, `steer`, `follow_up`, `abort`) require `owner === "remote"`,
  otherwise they fail with `lease_denied:tui_owns_input`.
- Remote takeover while the TUI owns input asks the TUI user via a confirm dialog
  (auto-granted only when no TUI is present, e.g. RPC mode).
- Any TUI-typed input instantly reverts ownership (`reason: "tui_input"`).

## Limitations (spike)

- **No authentication.** The socket shares the pi process's trust domain (same user).
  The oqto runner must place it in a session-scoped directory; never expose it on TCP.
- **Single writer.** One lease, no multi-writer arbitration.
- **TUI-only interactions stay TUI-only.** Built-in interactive commands, `ctx.ui.custom()`
  components, and tool approval dialogs render in the TUI; remote clients observe
  compaction/status but answer dialogs at the terminal.
- **pi 0.74 extension API.** The fanout list matches the pinned API; `agent_settled` is
  registered forward-compatibly (silently unused on 0.74, delivered on 0.85+). Idle detection
  uses `ctx.isIdle()`. Re-check the fanout list when oqto bumps its pi pin.
- Fork/tree navigation and session switching are intentionally out of scope (command-context
  only, idle-restricted; defer to the runner).

## Tests

```bash
bun test pi-tui-rpc          # unit tests (lease, dispatch, protocol, hub)
bun run check                # lint + typecheck
```

Live E2E is driven with `test-client.mjs` inside tmux against a real pi TUI; see
piext-6j02 for the scripted proof. Verified on pi 0.85.1 (2026-09-07):

- Remote prompt streamed the full event stream; the TUI showed the same exchange.
- TUI-typed input streamed to a connected observer while it stayed idle-safe (simultaneity).
- Lease: remote takeover via TUI confirm dialog; TUI typing reverted ownership
  (`tui_input`); remote prompt without the lease failed with `lease_denied:tui_owns_input`.
- Streaming: mid-turn prompt without `streamingBehavior` errored; `steer` was accepted and
  its text delivered into the conversation (final answer contained the steer marker).
- Session-file run: 8/8 JSONL lines valid; both the remote and the TUI user messages plus
  both assistant replies persisted by the single writer.

# pi-herdr-tools

Herdr-flavored tools for pi: delegate a task to a new pi subagent in a fresh
herdr tab, and fork the current session into its own named tab to steer it in a
different direction. (Both capabilities are herdr-specific — they drive the
herdr CLI to create tabs/agents.)

You (the user) stay the decider: spawning is gated by a config file (kill
switch, model allowlist, concurrent allowance), and an approval prompt is shown
before each spawn unless you turn it off.

## Install

The extension lives in the global auto-discovery directory:

```
~/.pi/agent/extensions/pi-herdr-tools/index.ts
```

Reload pi (`/reload`) to pick it up. It works in any herdr-managed pi session.

(The published source lives in the `pi-agent-extensions` repo under
`pi-herdr-tools/`; `~/.pi/agent/extensions/pi-herdr-tools` is a deployed copy
of it.)

## Tool

### `subagent`

A single consolidated tool with an `action` enum, so it stays light in the
agent's context. Default is `spawn`.

| action | description |
|--------|-------------|
| `spawn` (default) | Delegate a task to a NEW subagent in a fresh herdr tab |
| `list` | List the subagents this session spawned + status |
| `info` | Return the compute / data-residency / cost catalog + loadouts |

`spawn` parameters:

| param | required | description |
|-------|----------|-------------|
| `task` | yes | What to delegate to the subagent |
| `kind` | no | herdr agent kind, e.g. `pi` (default), `claude`, `codex` |
| `model` | no | pi model id (for `kind=pi`). Defaults to the current model |
| `loadout` | no | Named loadout that gates/chooses the model (see "Model catalog") |
| `tabLabel` | no | Label for the new herdr tab |
| `cwd` | no | Working directory. Defaults to the current directory |

`spawn` flow (via the herdr CLI):

1. `herdr tab create --label <label> --cwd <cwd> --no-focus`
2. `herdr agent start <name> --kind <kind> --pane <pane> [-- --model <model>]`
   (`--model` is passed only when `kind=pi`)
3. `herdr agent prompt <name> "<task>"` (async — no `--wait`)

The subagent is named `sub-<random>`, so it is counted and listed.

## Model catalog

The extension reads a byteowlz **model catalog** (independent of eavs/pi) at
`~/.pi/agent/model-catalog.json` (configurable via `catalogPath` in
subagent-config.json). It carries per-provider/model metadata
(`dataResidency`, `zdr`, `costType`, `spawnKind`, `tags`) + named `loadouts`
+ `policy`. It is layered, most-specific wins:

1. global `catalogPath`
2. `<cwd>/.pi/model-catalog.json`
3. `<cwd>/model-catalog.json`

Loadouts resolve to a set of allowed model ids + spawn kinds, which gates
`subagent` spawning (e.g. `local`, `data-privacy`, `fixed-cost`,
`per-token`). `subagent` with `action=info` surfaces the catalog to the agent.

> Keys are never stored in the catalog — only references (`env:VAR` /
> `keychain:<name>`), resolved against the system keychain by eavs or by the
> extension when eavs is absent.

## Commands

`/subagent` — config + **per-session** settings + lifecycle:

| command | effect |
|---------|--------|
| `/subagent status` | Show config + per-session state + active subagents |
| `/subagent on` / `off` | Enable / disable **agent-initiated** spawning (kill switch) |
| `/subagent mode <auto\|confirm\|timeout>` | Set **this session's** allow mode |
| `/subagent decide <allow\|deny>` | What a timed prompt does when it times out |
| `/subagent timeout <ms>` | Timed prompt's auto-decide delay (default 60000) |
| `/subagent max <n>` | Set **this session's** concurrent allowance (`0` = unlimited, `default` = fall back to config) |
| `/subagent list` | List subagents this session spawned + their status (incl. done/closed) |
| `/subagent history` | Durable record of this session's finished/closed subagents (outcome + end time) |
| `/subagent close <name>` | Close a subagent's tab (kills it) |
| `/subagent reset <name> [task]` | Interrupt a subagent and (optionally) re-prompt it |
| `/subagent models` | Open the **interactive provider/model picker** |
| `/subagent models add <glob>` | Allow a model pattern (repeatable) |
| `/subagent models remove <glob>` | Remove an allowlisted pattern |
| `/subagent models list` | Show the allowlist + loadouts |
| `/subagent models clear` | Empty the allowlist (allow all) |
| `/subagent models loadout <save\|load\|delete\|list> [name] [local\|global]` | Manage named model presets (two scopes) |
| `/subagent models allow-global <on\|off>` | Let this session use/hold global loadouts |
| `/subagent models force <name\|off>` | Pin this session to a loadout |

### Allow mode (per session)

`/subagent mode` controls how a spawned subagent is approved:

- **`auto`** — no prompt; spawn immediately.
- **`confirm`** — always ask the user, wait indefinitely (the old behaviour).
- **`timeout`** — ask the user, but if they don't answer within `confirmTimeoutMs`
  the session **auto-decides** to `allow` or `deny` (set with `/subagent decide`).

In `confirm` and `timeout` modes the prompt offers three actions:
**y/Enter** allow, **n/Esc** deny, and **m** change model — a fuzzy picker over
all available models that approves the spawn with the picked model for just this
spawn (shown when the kind consumes a model, i.e. `pi`). While the picker is
open the countdown is suspended; Esc returns to the prompt with a fresh countdown.

The mode, decision, timeout and allowance are stored **per session** (keyed by the
pi session id), so each session gets its own policy and it survives a resume/reload.

### Model picker + loadouts

`/subagent models` opens an interactive picker: it lists every available
provider and its models with checkboxes. **Space** toggles the highlighted row
(model or whole provider), **↑↓** navigate, **type** to filter, **Enter** saves the
session's allowlist, **Esc** cancels.

Loadouts are named presets. There are **two scopes**: **global** (shared across
sessions, stored in `~/.pi/agent/subagent-config.json`) and **local** (per
session, stored in the session state file).

```
/subagent models loadout save  cheap            # save current allowlist as a LOCAL loadout
/subagent models loadout save  cheap global     # save as a GLOBAL loadout
/subagent models loadout load  cheap           # apply (local first, then global if allowed)
/subagent models loadout delete cheap [local|global]
/subagent models loadout list                  # show local and global loadouts
```

A session can opt in or out of global loadouts, and pin itself to a loadout:

```
/subagent models allow-global <on|off>    # this session may use global loadouts (default on)
/subagent models force <name>             # pin this session to a loadout (local first, then global)
/subagent models force off                # unpin (session uses its own allowlist)
```

The **effective allowlist** a session uses for spawning is resolved as:

1. **force** — the loadout pinned by `/subagent models force <name>`
   (resolved local-first, then global if allowed).
2. **session** — the session's own allowlist (set by the picker / `add` / `remove` / `clear` / `load`).
3. **global** — the default `allowedModels` in the global config file.

### Completion notification

When a subagent this session spawned finishes (`done`), a user message is
injected into **this** session automatically, so the sending agent is told and
can collect the result. This keeps working across a session resume/reload.

### Durable history + push close events

`herdr agent list` is a **live** registry: a finished/closed subagent drops out
and vanishes from the fleet view. To never lose the fact that an agent ran and
how it ended, this extension records a terminal **outcome** for every subagent:

- **`done`** — observed finishing normally (via polling `agent_status`).
- **`closed`** — the tab was closed (via `/subagent close`, or the user closed the
  tab directly in herdr).
- **`error` / `unknown`** — reserved for future signals.

Every outcome is:

1. Written to an **append-only ledger** at `~/.pi/agent/subagent-history.jsonl`
   (node-local, survives anything).
2. Kept in the per-session state (via `/subagent history`).
3. **Emitted to the gvnr fleet-intake event log** if `GVNR_EVENT_URL` (and
   `GVNR_TOKEN`) are set — so the fleet has a durable trail of "what ran and how
   it ended", not a per-session file.

**How closes are detected:** the extension subscribes to the herdr socket's
`events.subscribe` stream for `tab.closed` / `pane.closed` / `pane.exited`
(framed as newline-delimited JSON over `HERDR_SOCKET_PATH`), so a tab you close
directly in herdr is recorded **on the next pushed event**, even without a re-poll.
The existing `herdr agent list` polling is kept as a **fallback** for events missed
while unsubscribed (e.g. the extension restarted before the agent closed).

> gvnr emission is best-effort and never blocks the session; the durable
> node-local ledger + `/subagent history` are always on. Set `GVNR_EVENT_URL`
> + `GVNR_TOKEN` to enable the fleet-side audit record.

### Close / reset

- `/subagent close <name>` — close the subagent's tab (it is killed).
- `/subagent reset <name>` — interrupt the running task (Ctrl+C) and return it to
  idle; add an optional task to re-prompt it immediately.

`/side` / `/btw` — open the **current session** in its own new named tab, forked
so you can steer it another direction (like Claude `/btw` or Codex `/side`, own tab):

```
/side fix-bugs --model openai/gpt-5 "Fix the failing tests then report"
```

- first bare token = tab label; `--model M` optional; rest = optional steering instruction
- creates a new tab, forks the current session (`pi --fork <current file>`)
  into a brand-new session file, opens pi there
- the fork's header records `parentSession` → the file you came from

`/send` — forward this agent's last response to another herdr tab.
`/relay` — alias of `/send`.

Handy when an answer belongs in a sibling tab, or you want another agent to
pick up where this one left off:

```
/send
```

Flow:

1. grabs the most recent assistant output from the current session
2. gathers the other live herdr agents **fresh on every run** (agent, tab and
   workspace lists) and opens a **fuzzy picker** grouped by workspace/repo
   (`▾ kompressor`, `▾ govnr`, …; remote machines group as `machine/repo`),
   type to filter, ↑↓ to navigate, PgUp/PgDn to page, Enter to pick. Rows are
   labelled `tab label — terminal title` since terminal titles can go stale
   while tab labels are what you actually named them
3. shows a compose box with a preview of the output; type an optional note
4. sends `note + output` to the target via `herdr agent prompt <pane> "…"`

Remote targets: agents on **saved SSH machines** (`herdr machine add`) are listed
alongside local ones, prefixed with the machine label (`buildbox: π - repo`).
Sending routes through `herdr --machine <profile-id> …`, which needs herdr
>= 0.9.1 on this machine **and** on the remote; unreachable machines are skipped
with a warning and never fall back to Local.

Keybindings in the compose box:

- **Enter** — send to the target tab (fire-and-forget)
- **Ctrl+j** (or Ctrl+Enter) — **send and cross-inject**: waits for the target to
  settle, reads its recent output, and feeds that response back into *this* session
  as a follow-up (via `sendUserMessage`), so this agent can steer on what it replied
- **Esc** — cancel

Your own pane is excluded from the target list (via `HERDR_PANE_ID`).

## Config file

`~/.pi/agent/subagent-config.json`

```json
{
  "enabled": true,
  "requireConfirmation": true,
  "allowedModels": [],
  "maxSubagents": 3,
  "allowMode": "confirm",
  "autoDecision": "deny",
  "confirmTimeoutMs": 60000,
  "loadouts": {}
}
```

- `enabled` — kill switch for agent-initiated spawning. `false` ⇒ the tool refuses.
- `requireConfirmation` — legacy flag still read; `true` maps to `allowMode: confirm`,
  `false` to `allowMode: auto`.
- `allowedModels` — glob patterns, e.g. `["openai/*", "archvm/*"]`. Empty = all allowed.
- `maxSubagents` — **default** max concurrent subagents per session (`0` = unlimited).
  A session overrides it with `/subagent max <n>` (stored in the session state file).
- `allowMode` — default allow mode: `confirm` | `auto` | `timeout`.
- `autoDecision` — when `allowMode` is `timeout` and nobody answers: `allow` | `deny`.
- `confirmTimeoutMs` — how long the timed prompt waits before auto-deciding.
- `loadouts` — named model-presets (globs), managed via `/subagent models loadout`.

## Per-session state

Settings and the set of spawned subagents are scoped to one pi **session**, stored under:

```
~/.pi/agent/subagent-state/<sessionId>.json
```

The allowance counts only subagents **this** session spawned that are still live
and not finished, so it is never polluted by another session's (or workspace's)
subagents; it also survives a resume/reload. If `getSessionId()` is unavailable
(ephemeral `--no-session`), state stays in memory only.

The session state file also holds the **local loadouts** and the per-session
model controls: `allowlist`, `loadouts`, `allowGlobalLoadouts`, `forceLoadout`.
(See "Model picker + loadouts" above for how the effective allowlist is resolved.)

## Socket, not magic

herdr is socket-backed (`HERDR_SOCKET_PATH`). Per the herdr docs, most
automation should use the CLI wrappers (which the extension does); the raw
socket is for direct request/response control or long-lived event
subscriptions.

## Two TUIs on one session — do they auto-branch? No.

Sessions are stored as trees in a single JSONL file, but each pi process is
**single-writer per file**:

- it loads the file once at startup,
- appends new entries as it goes,
- does **not** watch/reload the file, and takes **no lock**.

So if two TUIs pointed at the *same* session file, both would hold divergent
in-memory trees and both append interleaved lines to one file — you'd get
conflicts and corruption, **not** automatic branching. `/tree` gives you
in-place alternatives *within* one running pi; it is not a live multi-window
model.

To steer a copy in a different direction in its *own* tab, `/side` (and
`/btw`) **fork** the current session into a new file via `pi --fork`, which:

- copies all entries,
- gives it a fresh session ID and `cwd`,
- records `parentSession` → the source file,
- opens pi in a new named herdr tab from that fork.

That is the correct "own tab, different direction" primitive. You can find the
forked session later under the new tab's working directory in `pi -r` / `/resume`.

## Notes

- Agent names must match `[a-z][a-z0-9_-]{0,31}` — subagents are `sub-xxxxxx`,
  side tabs `side-xxxxxx`.
- `openSideTab` requires a persisted session (not `--no-session`).
- The extension reports errors via the tool/command result; herdr CLI JSON is
  surfaced directly when parsing fails.

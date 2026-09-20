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

### `delegate_subagent`

The current agent calls this to spawn a subagent. Parameters:

| param | required | description |
|-------|----------|-------------|
| `task` | yes | What to delegate to the subagent |
| `model` | no | pi model pattern (e.g. `openai/gpt-5`, `archvm/gemma-4-E4B-it`). Defaults to the current model |
| `tabLabel` | no | Label for the new herdr tab. Defaults to a slug of the task |
| `cwd` | no | Working directory. Defaults to the current directory |

Flow (via the herdr CLI), documented automation path:

1. `herdr tab create --label <label> --cwd <cwd> --no-focus`
2. `herdr agent start <name> --kind pi --pane <pane> -- --model <model>`
3. `herdr agent prompt <name> "<task>"` (async — no `--wait`)

The subagent is named `sub-<random>`, so it is counted and listed.

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
| `/subagent list` | List subagents this session spawned + their status |
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
2. opens a **fuzzy picker** (search box + fuzzy-filtered list) of the other live
   herdr agents (identified by pane): type to filter, ↑↓ to navigate, Enter to pick
3. shows a compose box with a preview of the output; type an optional note
4. sends `note + output` to the target via `herdr agent prompt <pane> "…"`

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

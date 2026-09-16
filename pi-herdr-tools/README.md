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

`/subagent` — config + status:

| command | effect |
|---------|--------|
| `/subagent status` | Show config + active subagents |
| `/subagent on` / `off` | Enable / disable **agent-initiated** spawning (kill switch) |
| `/subagent confirm` / `noconfirm` | Require / skip the user-approval prompt before spawning |
| `/subagent models add <glob>` | Allow a model pattern (repeatable) |
| `/subagent models remove <glob>` | Remove an allowlisted pattern |
| `/subagent models list` | Show the allowlist |
| `/subagent max <n>` | Set concurrent allowance (`0` = unlimited) |

`/side` / `/btw` — open the **current session** in its own new named tab, forked
so you can steer it another direction (like Claude `/btw` or Codex `/side`, own tab):

```
/side fix-bugs --model openai/gpt-5 "Fix the failing tests then report"
```

- first bare token = tab label; `--model M` optional; rest = optional steering instruction
- creates a new tab, forks the current session (`pi --fork <current file>`)
  into a brand-new session file, opens pi there
- the fork's header records `parentSession` → the file you came from

## Config file

`~/.pi/agent/subagent-config.json`

```json
{
  "enabled": true,
  "requireConfirmation": true,
  "allowedModels": [],
  "maxSubagents": 3
}
```

- `enabled` — kill switch for agent-initiated spawning. `false` ⇒ the tool refuses.
- `requireConfirmation` — always ask the user before spawning (default `true`).
- `allowedModels` — glob patterns, e.g. `["openai/*", "archvm/*"]`. Empty = all allowed.
- `maxSubagents` — max concurrent subagents named `sub-*` (counted via
  `herdr agent list`). `0` = unlimited.

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

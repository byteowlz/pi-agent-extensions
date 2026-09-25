# Changelog

All notable changes to pi-agent-extensions will be documented in this file.

## [Unreleased]

### pi-history-search: fix "no such table: messages_fts" under Node

- **Root cause.** The node:sqlite opener passed `undefined` options explicitly
  (`new DatabaseSync(path, undefined)`), which Node validates as a TypeError —
  so every read-write index open failed silently, indexing never ran, and
  searches fell back to read-only opens of leftover 0-byte `index.db` files
  whose queries then crashed with `no such table: messages_fts` instead of
  degrading to the live scan. Only manifests when pi runs under Node (the Bun
  branch was unaffected). The opener now omits the options argument entirely
  for read-write opens.
- **Hardening.** Read-only opens now verify the index schema before use and
  report "no index" (callers fall back to the live scan) when the file is empty
  or tableless, and the read-only search path catches query errors and degrades
  to a live scan instead of surfacing SQL errors to the tool result.

### pi-herdr-tools: remote relay targets + model override on spawn confirm

- **/send lists remote herdr targets.** Agents on saved SSH machines
  (`herdr machine list`) now appear in the /send and /relay fuzzy picker
  alongside local ones, prefixed with the machine label. Picking a remote
  target routes the prompt (and the Ctrl+j cross-inject read-back) through
  `herdr --machine <profile-id>`, so it lands on the right server even when
  pane ids collide across machines. Requires herdr >= 0.9.1 locally and on the
  remote; machines that fail to answer are skipped with a warning instead of
  blocking the picker, and never fall back to Local.
- **Change the subagent model at the spawn prompt.** In `confirm` and `timeout`
  allow modes, the spawn confirmation now offers a third action besides
  allow/deny: press `m` to fuzzy-pick a different model from all available
  models; the spawn is then approved with that model for just this spawn
  (only shown for kinds that consume a model, i.e. `pi`). While the picker is
  open the auto-decide countdown is suspended; Esc returns to the prompt with
  a fresh countdown.

### pi-herdr-tools: durable subagent history + push close events

- **Durable outcome history.** Every subagent now records a terminal `outcome`
  (`done` / `closed`) plus an `endedAt` timestamp, written to an append-only
  ledger at `~/.pi/agent/subagent-history.jsonl` and kept in the per-session
  state. New `/subagent history` lists this session's finished/closed subagents;
  `/subagent list` now shows `closed`/`done` outcomes with end time.
- **Push close detection.** Subscribes to the herdr socket's `events.subscribe`
  stream (`tab.closed` / `pane.closed` / `pane.exited`) over `HERDR_SOCKET_PATH`
  (NDJSON framing), so a tab you close directly in herdr is recorded on the next
  pushed event without a re-poll. The existing `herdr agent list` polling is kept
  as a fallback for events missed while unsubscribed.
- **fleet event emission.** `POST /events` to the gvnr fleet-intake audit log
  (`gvnr-dpty` envelope) when `GVNR_EVENT_URL` (+ `GVNR_TOKEN`) are set, carrying
  `AGENT_CTX_*` provenance — best-effort, never blocks the session.

### pi-ssh-key: load an SSH private key into a session-scoped ssh-agent

- `/ssh-key-load [path] [seconds]` picks a private key from `~/.ssh` (or a named
  path) and adds it to an ssh-agent, prompting for the passphrase through pi's
  masked UI when protected. An optional timeout (seconds) bounds the key's
  lifetime in the agent.
- Reuses the user's existing `SSH_AUTH_SOCK` when reachable; otherwise starts a
  dedicated pi-owned `ssh-agent` and sets `SSH_AUTH_SOCK`/`SSH_AGENT_PID` for the
  process, restoring them on unload/shutdown.
- `/ssh-key-unload [path]` removes one key or tears down the agent + restores env;
  `/ssh-key-timeout [seconds]` sets the loaded keys' lifetime; `/ssh-key-status`
  reports agent + keys.
- Optional `ssh-key.json` config (`keyDir`, `defaultTimeout`).
- **oqto SSH proxy sessions.** When `OQTO_SSH_AGENT=proxy` is set (owned by
  oqto-runner), `ssh-key-load` requests a grant via `OQTO_SSH_GRANT_CMD`
  (JSON stdin/stdout contract) or prints host-load + `[ssh].allowed_keys`
  guidance instead of `ssh-add`. The extension is a passive consumer of the
  contract; the oqto-runner implements the grant side in a separate oqto trx.

### pi-herdr-tools: per-session subagents, completion notifications, close/reset, timed allow, model picker

- **Per-session allowance (fix).** The subagent cap is now scoped to one pi
  session via a persistent state file
  (`~/.pi/agent/subagent-state/<sessionId>.json`). The allowance counts only
  subagents that session spawned that are still live and not `done`, so it is
  never polluted by another session's/workspace's agents, and it survives a
  resume/reload (the old in-memory `spawnedBySession` set was lost on reload,
  letting the cap reset). `/subagent max <n>` sets the session's allowance;
  `/subagent max default` falls back to the global config value.
- **Completion notification.** A background monitor polls tracked subagents and
  injects a user message into **this** session when one finishes (`done`), so
  the sending agent is told and can collect the result. Works across a reload.
- **Close/reset.** `/subagent close <name>` closes a subagent's tab;
  `/subagent reset <name> [task]` interrupts the running task (Ctrl+C), returns
  it to idle, and optionally re-prompts it.
- **Per-session allow mode.** `/subagent mode <auto|confirm|timeout>` sets how
  a spawn is approved: auto-allow, always-confirm, or a **timed prompt** that
  auto-decides (`/subagent decide <allow|deny>`) after `/subagent timeout <ms>`.
  The mode/decision/timeout are stored per session.
- **Interactive model picker + loadouts.** `/subagent models` opens a
  provider/model picker (Space to toggle a row or a whole provider, ↑↓
  navigate, type to filter, Enter saves the allowlist). Loadouts (named
  presets) are managed via `/subagent models loadout save|load|delete|list`.
- **Dual-scope loadouts + per-session model controls.** Loadouts exist in two
  scopes: **global** (`~/.pi/agent/subagent-config.json`) and **local**
  (per-session state file), e.g. `loadout save <name> [local|global]` /
  `loadout load <name>` (local first, then global if allowed). A session can
  toggle global loadouts (`allow-global <on|off>`) and pin itself to a loadout
  (`force <name>` / `force off`). The effective allowlist is resolved:
  force → session allowlist → global default, and the delegate/model check now
  uses that effective list.

### pi-oqto-todos: preserve todos across context compaction

- New `session_compact` (after-compaction) handler: after pi compacts the
  session, the extension injects the **current to-do list** into the LLM context
  as a `custom_message` entry (via `pi.sendMessage` with `triggerTurn: false`),
  with a reminder to keep using the `TodoWrite` / `TodoRead` / `Todo` tools.
- Uses the **after**-compaction hook, so the extension never re-runs or
  replaces pi's own summarizer — no extra LLM call, no API key, and the
  compaction summary itself is left untouched.
- Fixes the failure mode where a model, after a context compaction, forgot the
  todo panel existed and stopped updating it.
- Gated by new config option `preserveInCompaction` (default `true`); set to
  `false` to disable. Falls back silently on any error.

### pi-herdr-tools: relay (/send) — cross-tab response forwarding + injection

- New `/send` command (alias `/relay`): copy this agent's most recent assistant
  output, pick a target herdr agent via a **real fuzzy picker** (search box fed into a `SelectList.setFilter`, ↑↓ navigate, Enter select; own pane excluded
  via `HERDR_PANE_ID`), add an optional note, and send via
  `herdr agent prompt <pane>`.
- The target picker filters with pi-tui's `fuzzyFilter` (in-order, case-insensitive,
  gap-tolerant subsequence match over the target's terminal title + pane id, scored
  and ranked). Earlier drafts used `SelectList.setFilter`, which is only a naive
  `value.startsWith(query)` prefix match that searched the bare pane id — that made
  any non-pane-id query (e.g. `pixel`) match nothing. The picker now renders and
  navigates its own fuzzy-scored rows instead.
- Compose box is a custom TUI modal (preview + note editor): **Enter** = send to
  the target (fire-and-forget), **Ctrl+j**/**Ctrl+Enter** = **cross-inject** —
  waits for the target to settle (`prompt --wait`), reads its recent output
  (`agent read --source recent`), and feeds that response back into *this* session
  as a follow-up via `pi.sendUserMessage`, so the current agent can steer on it.
  **Esc** = cancel.
- Adds `herdrRaw` helper for reading raw (non-JSON) `agent read` output.

### pi-herdr-tools: relay (/send) — forward last response to another tab

- New `/send` command (alias `/relay`): copy this agent's most recent assistant
  output, pick a target herdr agent via a fuzzy picker (own pane excluded via
  `HERDR_PANE_ID`), add an optional note, and send via `herdr agent prompt <pane>`.
- Compose box is a custom TUI modal (preview + note editor): **Enter** = send to
  the target, **Ctrl+j**/**Ctrl+Enter** = send and also paste the message into
  this tab's editor, **Esc** = cancel.

### pi-herdr-tools: herdr-flavored delegation + session forking

- New extension (renamed from `pi-subagent-delegate`; herdr-specific, so the
  name reflects the bundle): `delegate_subagent` tool + `/subagent` config for
  agent-initiated subagent spawning, and `/side`/`/btw` to fork the current
  session into its own named herdr tab.
- Spawning is user-gated via `~/.pi/agent/subagent-config.json` (kill switch,
  confirmation prompt, model allowlist, concurrent allowance) and driven
  through the herdr CLI (`tab create -> agent start -> prompt`).
- `/side`/`/btw` fork via `pi --fork <session file>` (single-writer safety:
  each tab gets its own file, never two TUI writers on one file).

### pi-env-ctx: AGENT_CTX v2 — read herdr env directly (piext-wvx0)

- Bumped `AGENT_CTX_VERSION` to `2` and adopted the v2 producer-map contract from
  `byteowlz/schemas/agent-context-env` (platform → multiplexer → harness → host).
- New multiplexer/agent bag emitted only when `HERDR_ENV === "1"`: `AGENT_CTX_MULTIPLEXER=herdr`,
  `AGENT_CTX_AGENT_ID`/`AGENT_CTX_AGENT_ADDRESS` = `$HERDR_PANE_ID`, `AGENT_CTX_WORKSPACE_ID`
  = `$HERDR_WORKSPACE_ID` (opt). `AGENT_LABEL` deliberately deferred (needs an async socket call
  to herdr for the tab/pane title).
- New host bag always emitted: `AGENT_CTX_MACHINE_ID` (herdr machine name if exposed else
  `os.hostname()`), `AGENT_CTX_NODE_HOSTNAME`, `AGENT_CTX_OS_ARCH` (x64 → amd64).
- `readHerdrLayer`/`readHostLayer` folded into `exportAll`/`refreshFromContext`; all new vars
  added to `clearOwned`. Host access is injectable (`HostModel`) so unit tests don't touch
  `process.env`/`os`.

### pi-xlatch-session: phone share target bound to one session

## [1.5.0] - 2026-09-07

### Added - pi-tui-rpc: dual-frontend session access (piext-6j02)

- New spike extension: run pi in TUI mode and drive the SAME session from external RPC
  clients over a Unix-socket JSONL server (`PI_TUI_RPC_SOCKET`, else tmpdir per pid).
- Outbound fanout of pi extension events (agent/turn/message/tool lifecycle, model and
  thinking changes, compaction, `input`) to all connected clients; `agent_settled` is
  forwarded forward-compatibly for pi 0.85+.
- Inbound commands: `prompt` (with `streamingBehavior` mapping), `steer`, `follow_up`,
  `abort`, `get_state`, `get_messages`, `lease` request/release.
- Input lease: TUI owns input by default; remote takeover requires a TUI confirm dialog;
  TUI typing instantly reverts ownership; input commands without the lease fail with
  `lease_denied:tui_owns_input`; lease changes broadcast and shown in the TUI status bar.
- Unit tests (lease state machine, dispatch, protocol framing, hub fanout/pruning/parse
  errors) plus a tmux-driven live E2E against pi 0.85.1; session-JSONL single-writer
  integrity verified. Spike is bridge-era: pi 2 presentation attachments replace it.

## [1.4.1] - 2026-09-05

- Clarify agent hints for post-compaction recall, current-session versus related-branch scopes, anchored drilldown, and incomplete search results. Correct HistoryGrep's outdated description of HistorySearch (piext-5ydf).

## [1.4.0] - 2026-09-05

### pi-history-search: evidence-first recall (piext-xcfm)

- Literal-first identifier search (`auto`/`grep`), explicit `exact`/`regex`/`fts` modes, and disclosed regex fallback on literal misses.
- Search and grep now return budgeted JSON (3,000 chars by default), ≤300-character evidence snippets, stable message/character anchors, and honest unknown completeness. Consumers of the old prose output must adapt.
- All-role evidence selection finds tool-result field values without command/file metadata floods; strict user/assistant/tool filters remain available. Empty branch scopes no longer escape into project-wide indexed results.
- `HistoryRead` accepts `matchPosition` for evidence deep inside a message; raw message whitespace is preserved.
- Recall contract regressions live here; shared/internal before/after benchmarks live in `byteowlz/bench`, with private cases kept outside git.

### Fixed - 2026-08-07

#### pi-kyz: prevent audit status lines from leaking into the TUI

Removed the extension's direct writes to the pi process's stderr. The pseudo-audit logger emitted `[kyz] ...` status lines for tool lifecycle events and secret operations; because pi owns that terminal stream, those lines could bleed into or corrupt the interactive TUI. The current kyz CLI has no audit subcommand, so the misleading stderr fallback and its hooks were removed rather than redirected. Added a regression test asserting that tool lifecycle events do not write to process stderr.

### Added - 2026-07-15

#### pi-history-search: context-overflow guard + HistoryGrep (surgical exact search)

All history tool results now pass through a **context-overflow guard** that
checks how much of the context window is left (`ctx.getContextUsage()`) and,
when a result would overflow it, truncates to a safe budget and prepends an
actionable warning (narrower query, `around:<msgIndex>`, `HistoryGrep`, lower
`maxMessages`/`maxTotalChars`). The budget is the smaller of an absolute cap
and `remaining_tokens × maxContextFraction × charsPerToken`, floored at a
minimum so nearly-full windows still return a sliver. `HistoryRead` also feeds
the budget into the read itself (when no explicit `maxTotalChars` is given) so a
huge session clips at message boundaries, not mid-stream. Only the result text
is guarded; structured `details` stay full. Configurable via the new
`contextGuard` block (`enabled`, `charsPerToken`, `maxContextFraction`,
`maxResultChars`, `minResultChars`).

New **`HistoryGrep`** tool: surgically and fast-search ONE session for an exact
substring or regular expression. It reads a single session file once and runs
one regex pass (no FTS, no tokenization), so it catches what tokenized
`HistorySearch` misses — code identifiers, camelCase names, stack traces, exact
error strings, file paths — and is fast even for large older sessions. Returns
pinpoint matches with `msgIndex` and a `«highlighted»` snippet; optional
`before`/`after` for a full-text context window. Typical flow: `HistorySearch`
finds the session, `HistoryGrep` extracts the exact lines.

New modules: `context-guard.ts`, plus `grepSession` in `indexer.ts`. Added unit
tests (`context-guard.test.ts`, `grep.test.ts`) covering budget math,
truncation, case sensitivity, regex, role filters, match caps, and the
zero-width-match guard.

Follow-up: the current (live) session is now excluded from `HistorySearch`
results by default (new `excludeCurrentSession` config, default `true`) — it is
already in the agent's context, so returning it is noise. The explicit
`current-branch` scope is exempt (it would otherwise always be empty).
Added `exclude-current.test.ts` (4 cases).

### Fixed - 2026-06-24

#### pi-auto-rename: avoid stale extension ctx crash after fast prompt sessions (piext-j2wq)

Guarded `pi.setSessionName` and `ctx.ui.setStatus` calls against stale extension context errors. When a short one-shot prompt completes before async rename work finishes, the extension no longer crashes the process. Added `isStaleContextError` helper and wrapped all late-bound context-dependent operations in `setNameAndNotify` and `handleRegen`. Added regression tests covering `before_agent_start` and `agent_end` hooks with simulated stale contexts.

### Added - 2026-06-16

#### pi-history-search: branch-aware scopes and branch metadata (piext-b2rp)

`HistorySearch` now supports branch-aware scopes in the current project (`current-tree`, `current-branch`, `siblings`, `ancestors`, `descendants`) in addition to `project` and `all`.

New `HistoryBranches` tool lists branches with mechanical metadata only (no summarization): branch id, parent/root ids, fork message index, created/updated timestamps, cwd, message count, last user/assistant previews, and recent touched files/commands.

`HistoryRead` can now read by `branchId` as an alternative to `sessionId`.

Config adds optional `branchAliases` (`history-search.json`) for manual human-friendly labels keyed by branch/session id.

Also added `/history branches` for interactive branch listing.

### Added - 2026-06-13

#### pi-sudo: remote sudo support

Added `remote_sudo_exec` for commands that need sudo on an SSH target. Remote sudo passwords are prompted through pi's masked UI and cached per host (`remote:<host>`) separately from the local sudo password. The bash guard now detects obvious `ssh host sudo ...` commands and tells the agent to use `remote_sudo_exec`, so the extension can distinguish local elevation from remote elevation.

### Fixed - 2026-06-11

#### pi-history-search: bounded HistoryRead output

`HistoryRead{query}` is now token-safe and more surgical by default: query reads return merged context windows around matching conversation messages unless a `roleFilter` is explicitly provided, cap results to 40 messages / 16k total characters by default, and report omitted context. Added `maxMessages` and `maxTotalChars` tool parameters for controlled expansion; `before`/`after` also tune query-match context windows.

### Changed - 2026-06-07

#### pi-markdown-export: readable "outline" rendering by default

Exports were dominated by tool output — on a sampled session, `toolResult`
messages were ~97% of the body (file dumps, command output), rendered as generic
`## System` blocks. Rendering is now an **outline** by default: user + assistant
text, with each assistant tool call shown as a compact one-liner
(a `- \`read(path)\`` list item) and tool result bodies omitted. The same sampled
session dropped from 412 KB to 15 KB (~96%). The renderer introduces no emoji or
decoration of its own — only session text is kept.

New config knobs (all back-compatible; outline is the default):

- `includeToolCalls` (default `true`) — compact `- \`tool(arg)\`` lines; set
  `false` for pure conversation.
- `includeToolResults` (default `false`) — include tool output bodies.
- `maxCharsPerMessage` (default `0` = unlimited) — per-message cap with a
  `… (truncated, N chars)` marker; pair with `includeToolResults` for a tamed
  transcript.

Tool result blocks, when included, are now labeled `## Tool` instead of
`## System`.

### Added - 2026-06-07

#### pi-markdown-export: bulk export, multi-select picker, and config-driven redaction (piext-3kk3)

Extended the markdown export extension well beyond single-session export.

- **`/export-md-all [--subdirs]`**: export every session whose working directory
  is the cwd (and, with `--subdirs`, any subdirectory) to `exportDir`
  (default `./pi-session-exports`), one `.md` per session. Directory matching
  reads each session's recorded `cwd` from its first JSONL record, so it is
  robust against pi's lossy `--{cwd}--` directory encoding.
- **`/export-md-pick [--subdirs]`**: a TUI multi-select picker (fuzzy filter,
  `Space`/`Tab` to toggle, `Ctrl+A` toggle-all, `Enter` to export) that also
  defaults to `exportDir`.
- **`markdown-export.json` config** (cwd / `.pi` / `~/.pi/agent` search order,
  with schema + example):
  - `replacements[]` — literal or regex find/replace rules.
  - `redactionCommands[]` — external CLIs run before writing. `scan` mode parses
    gitleaks/trufflehog JSON findings and masks the detected secrets; `filter`
    mode replaces the content with the command's stdout (or the in-place file).
    Missing tools degrade gracefully unless `required`.
  - `exportDir`, `includeSubdirs`, `includeThinking`, `sessionsDir`.
- **Redaction applies to all paths**, including the existing `/export-md`
  current-session command, before anything is written to disk.

Internals split into `config.ts`, `session.ts` (discovery + a shared JSONL→
Markdown renderer reused by the live-branch export), `redact.ts`, and
`picker.ts`.

### Removed - 2026-02-13

#### delegate and tmux-delegate extensions

Removed both `delegate/` and `tmux-delegate/` in favor of [pi-subagents](https://github.com/nicobailon/pi-subagents) (`pi install npm:pi-subagents`).

**Why:**

- Both extensions spawned pi subprocesses but captured only raw text output. pi-subagents uses `--mode json` to get structured event streams with token/cost tracking, tool call history, and proper abort propagation.
- tmux-delegate had multiple bugs that were never caught because the tmux visibility feature was not relied on: wrong `execute()` parameter order (params swapped between pi v0.50 and v0.52), broken exit code capture (`$PIPESTATUS` unavailable in zsh), and child sessions never created due to the parameter bug.
- The "watch live in tmux" value proposition is covered by Oqto child sessions and `onUpdate` streaming.
- pi-subagents additionally provides chain execution with `{previous}` placeholders, a TUI clarification overlay, agent management CRUD, skill injection, artifact management, and async background execution.

### Fixed - 2026-02-10

#### tmux-delegate: session manager crash and cross-project delegation (piext-v5t2)

**Problem:** `TmuxDelegate` crashed with "Cannot read properties of undefined (reading 'getSessionDir')" when `ctx.sessionManager` was undefined at runtime, and previously failed with "no active session file" when `getSessionFile()` returned `undefined`.

**Fix:** Made session linking fully optional with graceful fallback:

- Guard `ctx.sessionManager` access with optional chaining (`?.`)
- Only create linked child sessions (with `parentSession` in header) when the parent session file exists AND the task runs in the same working directory
- Cross-project delegations (different `cwd`) get their own independent sessions -- no parent link needed since they live in separate session directories
- When no session manager is available, tasks still spawn correctly; pi manages its own session in each tmux window

### Added - 2026-02-09

#### tmux-delegate extension

New delegation extension that spawns Pi subagents in visible tmux windows instead of hidden child processes. Key features:

- **Live visibility**: Each task runs in its own tmux window, switchable via `tmux select-window`
- **Oqto integration**: Child sessions are created with `parentSession` set, so Oqto renders them nested under the parent session in the sidebar
- **Async by default**: Returns immediately with run ID; use `TmuxDelegateStatus` to check progress
- **Sync mode**: Set `wait=true` to block until all tasks complete
- **Output capture**: All output piped through `tee` to both terminal and capture files
- **Agent discovery**: Uses the same markdown frontmatter agent files as the subagent extension
- **Parallel tasks**: Spawn multiple tasks in separate tmux windows simultaneously

Tools: `TmuxDelegate`, `TmuxDelegateStatus`

### Fixed - 2026-02-06

#### OAuth Compatibility - Tool Naming Convention

**Problem:** Claude Code OAuth authentication was failing with "not allowed by anthropic" errors due to tool naming violations.

**Root Cause:** Anthropic's OAuth validation requires PascalCase tool names to match built-in Claude Code tools (`Read`, `Write`, `Bash`, `Edit`, etc.). Extensions using snake_case or lowercase names were rejected.

**Changes:**

**oqto-todos extension:**

- `todowrite` → `TodoWrite`
- `todoread` → `TodoRead`  
- `todo` → `Todo`

**delegate extension:**

- `delegate` → `Delegate`
- `delegate_status` → `DelegateStatus`

**Documentation:**

- Added OAuth tool naming requirements to `AGENTS.md`
- Created `OAUTH-FIX.md` with technical details
- Updated global `~/.pi/agent/AGENTS.md` with naming convention

**Impact:**

- ✅ OAuth authentication now works
- ✅ All tools maintain full functionality
- ✅ Follows official Claude Code naming conventions
- ⚠️ Breaking: Tool names changed (old references need updating)

**Reference:** [GitHub PR #15](https://github.com/anomalyco/opencode-anthropic-auth/pull/15)

## [1.0.0] - Initial Release

### Added

- **auto-rename**: Automatic session naming using LLM
- **custom-context-files**: Inject custom context into sessions
- **oqto-todos**: Todo management integration with Oqto frontend
- **oqto-bridge**: Bridge for Oqto platform integration
- **delegate**: Spawn subagent processes for task delegation

### Infrastructure

- TypeScript configuration with strict mode
- Biome linting and formatting
- tsgo type checking
- Development scripts (check, lint, typecheck)

---

**Note:** Version numbers follow [Semantic Versioning](https://semver.org/).

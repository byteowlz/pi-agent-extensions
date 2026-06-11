# Changelog

All notable changes to pi-agent-extensions will be documented in this file.

## [Unreleased]

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

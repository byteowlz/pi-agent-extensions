# Changelog

All notable changes to pi-agent-extensions will be documented in this file.

## [Unreleased]

### Fixed - 2026-02-10

#### tmux-delegate: session file lookup crash (piext-v5t2)

**Problem:** `TmuxDelegate` failed with "no active session file. Cannot create child sessions." because `ctx.sessionManager.getSessionFile()` returned `undefined`. This happened because `getSessionFile()` can return `undefined` for sessions that haven't been flushed to disk yet (e.g. no assistant message persisted), or for in-memory sessions.

**Fix:** Use `ctx.sessionManager.getSessionDir()` (always returns a string) as the primary source for the session directory, instead of deriving it from `getSessionFile()`. The parent session file reference is now optional - child sessions are still created and functional even without the `parentSession` link (Octo nesting is a nice-to-have, not required).

### Added - 2026-02-09

#### tmux-delegate extension

New delegation extension that spawns Pi subagents in visible tmux windows instead of hidden child processes. Key features:

- **Live visibility**: Each task runs in its own tmux window, switchable via `tmux select-window`
- **Octo integration**: Child sessions are created with `parentSession` set, so Octo renders them nested under the parent session in the sidebar
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

**octo-todos extension:**
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
- **octo-todos**: Todo management integration with Octo frontend
- **octo-bridge**: Bridge for Octo platform integration
- **delegate**: Spawn subagent processes for task delegation

### Infrastructure

- TypeScript configuration with strict mode
- Biome linting and formatting
- tsgo type checking
- Development scripts (check, lint, typecheck)

---

**Note:** Version numbers follow [Semantic Versioning](https://semver.org/).

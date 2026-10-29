# Changelog

## 0.2.0

- Add `/move`: fuzzy project switching driven by configured roots. `/move`
  opens a picker over your projects, `/move foxline` matches by name, and an
  ambiguous query (`/move fox` → foxline + foxhole) asks with a pre-filtered
  picker instead of guessing. Non-interactive surfaces error with the candidate
  list. Exact and clear-prefix matches move straight away.
- Project roots are configurable via `.pi/session-cwd.json` (project) or
  `~/.pi/agent/session-cwd.json` (global): `roots`, `depth`, and
  `includeSessionDirs` (also offer directories that already hold sessions).
  A missing or malformed config falls back to `~/work` + `~/byteowlz`, never
  blocking the command. Hidden and build directories are skipped.
- `/move` accepts literal paths too (`/move ~/x/y`), delegating to the `/cwd`
  path logic, so one command covers "by name" and "by path".
- Replace `/mvcwd` with `/move` (same intent, project-aware and configurable).

## 0.1.0

- Initial release: `/cwd <path>` moves the running session to another working
  directory and relocates its session file. The header `cwd` is rewritten, the
  JSONL is staged and moved into the target cwd's session directory (old file
  removed only after the new one is in place), and `ctx.switchSession` rebuilds
  the runtime so tools, project `AGENTS.md`/settings and extension cwd follow.
  History, branches, labels, session name and other in-session state survive
  because the file is moved rather than rewritten.
- `/cwd` with no argument reports the current cwd, the session file and the last
  move; `/mvcwd` picks from directories that already have sessions;
  `/cwd-history` lists every move of the session.
- Moves are recorded as `pi-session-cwd:move/v1` custom entries (routing
  metadata, never LLM context).
- Interactive surfaces confirm first; RPC/print require `--force`, so a remote
  one-liner cannot silently relocate a session. Refusals are explicit for
  unpersisted sessions, missing/invalid targets, same-directory moves, headers
  without `cwd`, and destination collisions.
- Custom session dirs are honored: a `sessions` root keeps pi's per-cwd layout,
  any other directory is flat and moves become an in-place header rewrite.

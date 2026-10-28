# Changelog

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

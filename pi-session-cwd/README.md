# pi-session-cwd

Move a running pi session to another working directory — **and take the session
file with it**.

pi pins a session to the directory it started in: the JSONL header stores `cwd`,
the file lives in `~/.pi/agent/sessions/--<encoded-cwd>--/`, and the runtime
(tools, project `AGENTS.md`, project settings, extension cwd) is built from that
value. There is no built-in way to move a session between projects; `/resume`
only lists sessions of the current project.

```
/cwd                    show the current working directory and the last move
/cwd ~/Code/other       move this session (and its file) to that directory
/cwd ../sibling --force skip the confirmation (required on RPC / print)
```

## What actually moves

1. The header line's `cwd` is rewritten to the target directory.
2. The JSONL is moved into the target directory's session folder, keeping its
   filename. The write is staged (`*.tmp-<pid>` → rename) and the source is only
   removed after the destination is in place, so a crash cannot truncate a
   session.
3. `ctx.switchSession(newFile)` rebuilds the runtime from the new session's cwd,
   so tools, project files, project trust and extension `ctx.cwd` all follow.
   pi reports `Resumed session`.

Every entry — history, branches, labels, session name, `/ctx` limits, rename
history — is preserved, because the file is the session. A
`pi-session-cwd:move/v1` custom entry records each move for auditing
(`/cwd-history`); it never enters LLM context.

## What does not move

- **Files on disk.** Nothing is relocated. Relative paths in old messages keep
  meaning what they meant when they were written.
- **pi's process cwd.** pi never `chdir`s; a tool or bash command that resolves
  through the OS cwd rather than the session cwd still sees the launch directory.
  Everything pi itself resolves (read/edit/write, bash `cwd`, context files) uses
  the session cwd and therefore follows the move.
- **The old session directory.** It stays behind (usually empty). pi creates it
  again whenever a session lives in that cwd.

## Commands

| Command | Purpose |
| --- | --- |
| `/cwd` | Show the current working directory, the session file, and the last move |
| `/cwd <path> [--force]` | Move this session. `~` expands, relative paths resolve against the current cwd |
| `/mvcwd` | Interactive picker over directories that already have sessions |
| `/cwd-history` | Overlay listing every move of this session |

## Safety rules

- **Interactive surfaces ask first** (a TUI confirmation shows both the old and
  new cwd and the old and new session file path).
- **Non-interactive surfaces require `--force`.** RPC and print modes refuse a
  bare `/cwd <path>`, because a one-line remote command must not silently
  relocate someone's session.
- Refused before touching anything: unpersisted session, missing session file,
  target missing / not a directory, target equal to the current cwd, missing
  header `cwd`, and destination file collision.
- A running turn is aborted by the switch (pi's own semantics); the move
  notification says so when that happened.

## Custom session directories

`--session-dir`, `PI_SESSION_DIR` and `settings.sessionDir` are respected:

- A custom **sessions root** (directory named `sessions`) keeps pi's per-cwd
  layout: the file moves to `<root>/--<encoded-cwd>--/`.
- Any other custom directory is **flat**, so a move rewrites the header in place
  (same file, new cwd) — which is still a real move for pi, since the cwd lives
  in the header.

## Configuration

None. No config file, no environment variables beyond what pi itself uses.

## Limits

- Moving to a directory whose session folder already contains a session with the
  same filename is refused rather than overwritten.
- `switchSession` requires the target cwd to exist; it does, because the move
  checks it first.
- If the old file cannot be removed after a successful write, the move still
  completes and the error names the leftover path.

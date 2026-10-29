# pi-session-cwd

Move a running pi session to another working directory — **and take the session
file with it**.

pi pins a session to the directory it started in: the JSONL header stores `cwd`,
the file lives in `~/.pi/agent/sessions/--<encoded-cwd>--/`, and the runtime
(tools, project `AGENTS.md`, project settings, extension cwd) is built from that
value. There is no built-in way to move a session between projects; `/resume`
only lists sessions of the current project.

```
/move                   pick a project from your configured roots
/move foxline           fuzzy-match a project by name and move there
/move fox               several matches -> asks which one you meant
/cwd                    show the current working directory and the last move
/cwd ~/Code/other       move to an explicit path
/cwd ../sibling --force skip the confirmation (required on RPC / print)
```

`/move` and `/cwd` share the same move machinery; `/move` is the project-aware
front door (fuzzy names, picker, configured roots) and `/cwd` takes literal
paths.

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
| `/move [name] [--force]` | Move to a project found under the configured roots, fuzzy-matched by name |
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

`/move` reads project roots from JSON (first match wins):

1. `./.pi/session-cwd.json` (per project)
2. `<agent dir>/session-cwd.json` (default `~/.pi/agent/session-cwd.json`)

```json
{
  "roots": ["~/work", "~/byteowlz"],
  "depth": 1,
  "includeSessionDirs": true
}
```

| Key | Meaning |
| --- | --- |
| `roots` | Directories whose children are projects. `~` expands. Missing roots are ignored. |
| `depth` | How many levels below a root count as projects (1 = direct children, max 4). |
| `includeSessionDirs` | Also offer directories that already contain pi sessions, so you can move back to a project outside your roots. |

Defaults are `roots: ["~/work", "~/byteowlz"]`, `depth: 1`,
`includeSessionDirs: true`. A missing or malformed file falls back to those
defaults — it never blocks the command. Hidden directories and build output
(`node_modules`, `target`, `dist`, …) are never offered as projects.

## Fuzzy matching

`/move <query>` scores every candidate project:

| Match | Example | Behavior |
| --- | --- | --- |
| exact | `foxline` → `foxline` | moves without asking |
| prefix, clear winner | `foxl` → `foxline` | moves without asking |
| prefix, several hits | `fox` → `foxline`, `foxhole` | asks with a pre-filtered picker |
| subsequence | `fxl` → `foxline` | matches (weakest tier) |
| nothing | `zzz` | error naming the closest projects |

"Unsure" means: no exact/prefix-quality match, or another candidate scores
nearly as well. On RPC/print there is no picker, so an ambiguous query is an
error that lists the candidates instead of guessing.

## After the move

The session you are looking at **is** the moved session: `switchSession`
re-homes the live runtime, so pi reports `Resumed session` in the new directory
and every following turn resolves project files from there. No separate resume
step.

## Limits

- Moving to a directory whose session folder already contains a session with the
  same filename is refused rather than overwritten.
- `switchSession` requires the target cwd to exist; it does, because the move
  checks it first.
- If the old file cannot be removed after a successful write, the move still
  completes and the error names the leftover path.

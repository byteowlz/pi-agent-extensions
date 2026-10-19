# link-picker

Grab URLs, paths, env assignments, tokens, IDs and network endpoints mentioned in
the **current session** and copy them with **OSC 52** — no clipboard binary, works
over SSH, Herdr and tmux.

## Install

```bash
pi install npm:pi-link-picker
```

## Usage

Type `/grab` in a TUI session. Nothing is scanned before you ask.

```
╭──────────────────────────────────────────────────────────────────────────────╮
│ grab 7 found                                                                 │
│ [All 7] URLs 2  Paths 1  Env 1  Tokens 1  IDs 1  Network 1                   │
│                                                                              │
│ ▸ URLs    https://pi.dev/docs                                                │
│   Paths   src/index.ts                                                       │
│   Tokens  sk-a…uvwx                                                          │
│                                                                              │
│ ↑↓ Tab category / filter │ Enter copy p paste Space view v reveal             │
╰──────────────────────────────────────────────────────────────────────────────╯
```

## Keybindings

| Key | Action |
|-----|--------|
| `↑` `↓` (or `k` `j`) | Move |
| `Tab` / `Shift+Tab` (or `←` `→`) | Cycle category |
| `/` | Filter (Enter keeps it, Esc clears) |
| `Space` | Full-value preview |
| `v` | Reveal / hide redacted secrets |
| `Enter` | **Copy** the selected value with OSC 52 |
| `p` | Paste into the editor instead |
| `Esc` | Cancel (or close preview) |

## What it extracts

| Category | Examples |
|----------|----------|
| `URLs` | `https://…`, `ssh://…`, `git://…` — trailing prose punctuation trimmed, balanced parens kept |
| `Paths` | `src/index.ts`, `~/.pi/agent/models.json`, `/etc/hosts` — bare prose slashes (`either/or`) ignored |
| `Env` | `KEY=value`, `export TOKEN=…` (quotes stripped) |
| `Tokens` | JWTs, `sk-…`, `ghp_…`, `Bearer …`, long base64url, ≥32-char hex |
| `IDs` | `piext-9ca8`, UUIDs, git SHAs |
| `Network` | `100.64.0.12:4782`, `example.com:3033` |

Values are deduplicated (newest occurrence wins) and listed most-recent-first.
Items inside a URL are not double-reported as paths or endpoints.

## OSC 52

Copying writes an OSC 52 escape sequence to the terminal:

```
ESC ] 52 ; c ; <base64> BEL
```

- No `pbcopy`/`xclip`/`wl-copy` needed — works over SSH and inside Herdr.
- Inside **tmux** the sequence is wrapped in a DCS passthrough so tmux forwards it.
- Values larger than 100 KB fail closed and are pasted into the editor instead.
- If the terminal ignores OSC 52 (some do, as a matter of policy), use `p`.

## Privacy

- **Current session only.** The current branch's user and assistant messages are
  scanned locally; tool results, files, transcripts on disk and past sessions are
  never read.
- Nothing is uploaded, executed, logged to disk or sent to any model.
- Secret-looking values are **redacted in previews by default** (e.g. `sk-a…uvwx`);
  press `v` to reveal, and copying always copies the full value.
- Redaction is a display convenience, not a security boundary — the value is still
  in your session history.

## Notes

- TUI only (it is an interactive picker). In headless modes `/grab` just notifies.
- Terminal support for OSC 52 varies; see
  [the OSC 52 reference](https://invisible-island.net/xterm/ctlseqs/ctlseqs.html).

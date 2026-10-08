# pi-prompt-stash

Park a draft, recover earlier user prompts, or promote reusable text to a Pi
command. Text-only private JSON sidecars; no model tools, automatic submission,
provider calls, generated executable code or database.

## Use

**Ctrl+Alt+S** opens a menu without replacing the draft you are typing:

- **Park current draft** saves first, then clears only if the editor still
  contains that exact draft. **Stash draft copy** leaves it in place.
- **Saved prompts** opens searchable multi-selection, newest first.
- **User prompt history** browses recorded user-role prompts, including raw
  pre-compaction entries and alternative branches—not assistant/tool output,
  summaries or context edits. Unsubmitted drafts and handled slash commands
  aren't necessarily recorded and cannot be recovered retroactively.

Commands:

| Command | Behavior |
|---|---|
| `/stash` | Open menu |
| `/stash list [session\|cwd\|global]` | Browse saved prompts |
| `/stash history [session\|cwd\|global]` | Browse recorded user prompts |
| `/stash copy [scope]` | Copy editor text, if present |
| `/park [scope]` | Save editor text and clear it, if present |
| `/pop [scope]` | Restore latest saved prompt, then remove saved entry |

Scope defaults to **session**. Typing a slash command generally replaces your
current draft before the command executes: use the shortcut to capture a live
draft. `/hotkeys` lists the registered shortcut.

In the picker, type to search, ↑/↓ navigate, **Tab** toggles a checkbox (Space
also toggles when search is empty), Enter opens actions, **Ctrl+V** opens full
text preview with ↑/↓ scrolling, Esc returns/cancels. Selection persists across
searches. Actions include stash, **stash & promote**, promote, restore a copy,
pop one saved entry, and confirmed deletion. Original history is never edited.

## Scope and storage

- **Session:** `<session-file>.prompt-stash.json`, beside the actual session.
  Resuming that file resumes its stash; forks/new sessions don't inherit it.
  An ephemeral session has no session sidecar: explicitly choose cwd/global.
- **Cwd:** `<agent-dir>/prompt-stash/cwd/<sha256-canonical-cwd>.json`.
  Exact working-directory sharing, not parent/subdirectory or repository-wide.
  Nothing is placed in your repository or committed automatically.
- **Global:** `<agent-dir>/prompt-stash/global.json`.

`<agent-dir>` follows Pi's `PI_CODING_AGENT_DIR`, normally `~/.pi/agent`.
JSON version 1 holds `entries` and `commands`. Files are written privately (0600),
new directories 0700, using fsynced atomic replacement and a fail-fast exclusive
`.lock` directory across processes. Malformed/oversized data is never overwritten;
busy stores report an error instead of dropping changes. After an abrupt crash,
inspect a leftover lock and confirm no process is using it before manually
removing the **empty lock directory**; the extension never guesses ownership.
These files contain your prompt text: keep them out of shared/public storage.

Limits: 128 KiB per prompt/command, 2000 combined records, 8 MiB per sidecar.
Broader history browsing is explicit, asynchronous and bounded (2000 candidate
files, latest 100 candidate files, 32 MiB read, 1000 prompts; files over 8 MiB
skipped). Cwd searches the current configured session directory and checks exact
header cwd; global searches normal Pi storage plus the current session directory.
Other custom session roots are not automatically discovered. Bounds/skips are
reported, so this is a recent-history picker, not a complete retrieval engine.

## Promote to a command

Select prompt(s) → **Promote to commands**, choose availability scope, name each
`p-...` command (e.g. `p-laundry`), review/edit its full text, and confirm any
replacement. `/p-laundry` **fills the editor only**, without submitting. It is not
a native submit-on-expansion prompt template, and no JS/TS is generated.

Commands use session → cwd → global precedence and recheck the current scope on
invocation. Existing extension/template names aren't overwritten. Commands become
available immediately; `/reload` refreshes autocomplete if it hasn't updated.
A command left visible from an old session can't restore inaccessible text.

A nonempty editor offers **Cancel / Append / Replace**, and a changed draft
invalidates the decision. Pop verifies restoration before removal; failures keep
the saved entry. Session changes/reload/shutdown fence pending UI operations.

**Text only:** expanded pasted text is saved, not editor cursor position or
image/file attachments. Park only clears text; independently attached images
aren't archived by this extension. Historical prompts with attachments require
confirmation before using their text-only copy. Nothing is automatically sent to
a model—even a restored prompt beginning with `/` or `!` waits for your Enter.

## Install and verify

Install/copy the **whole `pi-prompt-stash/` directory** into the extension directory
and reload Pi. This source change does not update installed copies automatically.

```sh
bun test pi-prompt-stash
npm run check
```

Tests use synthetic data and temporary storage, not private user history.

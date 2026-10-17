# pi-conversation-edit

Human-controlled whole-message rewriting on an independent Pi session branch.
Uses native Pi `context_edit` records, never overwrites original messages and
never re-executes historical tools. No model-callable tools are registered.

## Use

1. Run `/rewrite` while idle. Park any unsent draft first; the command refuses
   to overwrite or silently move it. `/park` is available if pi-prompt-stash is installed.
2. Choose message rows to toggle selection, optionally filter their text, then
   Continue. Selection is chronological and capped at 20 whole messages.
3. Choose **Edit manually**, **Open in editor** (local TUI), or **AI rewrite**.
4. View each diff, optionally edit again, then Accept or Skip. Diff previews are
   scrollable built-in editors; edits made to the *preview* are explicitly ignored.
   Edit replacement to change the actual proposal. Escape cancels before applying.
5. Choose **Keep later context** (default) or **Restart after last selected message**,
   confirm, and continue in the new session. Nothing is submitted automatically.

`/rewrite inspect` previews the effective text of editable messages on the active
branch. **Historical chat bubbles, raw history and exports still show the originals.**
Native context edits change future model input, not historical records. These are
not permission grants and do not undo previous filesystem/network/tool actions.

## External editor

Set `VISUAL` or `EDITOR`, for example `nvim` or `code --wait`. Quoted executable
paths and arguments are supported; shell expressions, expansion and pipelines
are not. The operator's configured editor is launched directly with argv, not
through a shell. Pi suspends/resumes its terminal renderer around the editor.
Files live in a private temporary directory and are removed afterward. Reads are
bounded and reject symlinks, non-regular files, oversized content and invalid UTF-8.
GUI editors must use a wait flag. External editing is not offered in RPC/headless
hosts; use the host's built-in editor instead.

## AI rewriting

Pick an authenticated model and enter a rewriting instruction. After explicit
confirmation, **only the selected messages and instruction** are sent, individually;
no other history, system/tool loadout, attachments or tools are supplied. The model
registry performs authentication/provider routing. Each request has a 60-second
abort deadline and an 8192-token output cap. Truncation/error/tool-call responses
are rejected. All proposals still require human diff review. Provider requests may
incur cost even if proposals are declined; they are not ordinary chat turns.
Session replacement/shutdown or an agent run cancels pending work.

## Scope and safety

- Only current **projected**, text-only user/assistant messages are editable.
  Compacted-away history, system/tool policy, tools/results, thinking, images and
  other non-text blocks remain protected. Raw mixed-block messages are excluded
  even if another extension currently projects them as text.
- Latest 2000 eligible messages are offered. Each message is at most 32 KiB;
  selected original+replacement text at most 128 KiB. Empty replacements/deletion
  are not supported in v1. Terminal control text and malformed Unicode are rejected.
- Existing context edits are respected. Restart across a later compaction boundary
  is refused rather than silently resurrecting summarized context.
- The command is fenced to its session ID and leaf. Changes during review cancel
  it. Cancel/decline/no changes create no branch. A completed fork is staged in a
  private directory and published without overwrite only after edits are written.
- A declined session switch leaves the reviewed fork saved, original still active.
- This is not a sandbox: it does not prevent other tools from reading raw history.

## Configuration

First match wins: `./conversation-edit.json`, `./.pi/conversation-edit.json`,
then `<agent-dir>/conversation-edit.json` (uses Pi's configured agent directory).
All flags default to true. Invalid configuration fails closed; files are bounded
at 4 KiB. These are preferences, not protected security policy. See the schema/example.

## Install and verify

Copy the **whole** `pi-conversation-edit/` directory to your Pi extensions directory
and reload, or load `-e /path/to/pi-conversation-edit/index.ts`. No host services are
changed. Requires native Pi session projections/context edits and the model-registry
completion API supplied by the qualified Pi 1 runtime.

```sh
bun test pi-conversation-edit
```

Tests use synthetic sessions and fake model completions only. No private session
history or credentials are read or sent to providers.

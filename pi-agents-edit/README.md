# pi-agents-edit

Run `/agents-edit`, pick a loaded AGENTS.md path, then edit and save normally in
`$VISUAL` (preferred) or `$EDITOR`. Exit the editor to return to Pi. For GUI
editors use their wait flag, e.g. `EDITOR='code --wait'`.

The list comes from Pi's structured system-prompt context files, in load order,
with duplicates removed. It does not guess by scanning parent directories.
Requires a Pi runtime exposing `getSystemPromptOptions()` and native TUI mode;
RPC/browser hosts cannot launch an interactive local terminal editor.

The editor opens the original file, not a temporary copy. Saving takes effect on
disk immediately; the extension does not rewrite, back up, or roll back files.
Run `/reload` afterwards to refresh Pi's loaded instructions. Cancelling the
picker changes nothing. Editor failures restore the terminal and show an error.
Editor commands support quoted arguments but not shell expressions.

Load for testing: `pi --extension ./pi-agents-edit/index.ts`.

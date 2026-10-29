# pi-last-question

Keeps **your last question visible above the prompt box** — two lines, always in
view, with the full text one shortcut away.

```
  how do I rotate the deploy key without breaking the build
  for the running pods while the old one is cached… ⌥Q
┌─ prompt box ───────────────────────────────────────────────┐
```

On a long session you scroll away from what you actually asked. This pins it.

## Keys

| key | action |
|---|---|
| `ctrl+alt+q` | **expand** — full question in an overlay (`↑/↓` scroll, `enter` inserts it, `y` copies, `esc` closes) |
| `ctrl+alt+j` | **jump** — put the full question straight into the prompt box (appends to a draft) |
| `/last-question` | show it as a notification; opens the overlay in the TUI |

Copying and inserting both go through the prompt box on purpose: that is where
you can act on the text (edit, re-send, or yank it with your editor keys).

## Behaviour

- **Two lines, hard budget.** Continuation lines are indented; if the question
  doesn't fit, the last line ends `… ⌥Q` so the shortcut is discoverable exactly
  when it matters. No marker when it fits.
- **Tracks the current branch.** Updated on `session_start`, on each submitted
  prompt, and on `session_tree`, so after `/fork` or a tree jump it shows the
  question that branch answered.
- **Age label** when the timestamp is known (`3m ago`), so a resumed session does
  not pretend a week-old question is current.
- **Only real prompts.** Assistant turns, tool results, custom extension notes and
  compaction summaries are ignored.
- **TUI only.** In RPC/print the widget is skipped; `/last-question` still reports
  the text through `notify`.
- Newlines and runs of spaces are flattened, so a pasted multi-line question
  still renders as a tidy strip.

## Config

None. Nerd Font glyph `\uf128` prefixes the strip (blank if your font lacks it);
nothing else is configurable by design.

## Limits

- The strip sits above the editor, so it consumes two terminal rows while a
  question exists. It disappears when a session has no user message yet.
- "Jump to it" means *into the prompt box* — there is no scroll-to-message API in
  the extension surface; the overlay covers reading the full text in place.

# pi-last-question

Keeps **your last question visible above the prompt box** as a small card, with
the full text one shortcut away.

```
 ▌ 10/29/2026, 12:00 PM                              ⌥Q expand
 ▌ how do I rotate the deploy key without breaking the build for the
 ▌ running pods while the old one is cached in the sidecar container…
```

The card is drawn with pi's own primitives, so it belongs rather than intrudes:

- `Box(1, 0, theme.bg("customMessageBg"))` — the padded background rectangle pi
  uses for extension-provided blocks (every row is padded to the widget width, so
  it is a true rectangle, not ragged text).
- a left rule (`▌`) in `accent` plus `customMessageLabel` for the timestamp and
  `customMessageText` for the question — the same hierarchy pi uses in message
  headers.
- the shortcut hint right-aligned in `dim`, and it degrades gracefully: full
  `⌥Q expand` → `⌥Q` → omitted, before the timestamp is ever cut.

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

- **Two question lines, hard budget.** The card is one header row plus at most
  two question rows; when the text doesn't fit, the last row ends with `…`. No
  marker when it fits.
- **Tracks the current branch.** Updated on `session_start`, on each submitted
  prompt, and on `session_tree`, so after `/fork` or a tree jump it shows the
  question that branch answered.
- **Absolute timestamp** (`10/29/2026, 12:00 PM`, local time) rather than a
  relative age: the widget only re-renders when the branch changes, so "15s ago"
  would sit there frozen and lie. An absolute stamp stays true with no timer.
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

- The card sits above the editor, so it consumes three terminal rows (header +
  two question lines) while a question exists. It disappears when a session has
  no user message yet.
- "Jump to it" means *into the prompt box* — there is no scroll-to-message API in
  the extension surface; the overlay covers reading the full text in place.

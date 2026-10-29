# Changelog

## 0.3.0

- **Blue instead of violet, and no icon.** The card now borrows pi's user-message
  family — `userMessageBg` background, `border` rule, `mdLink` timestamp,
  `userMessageText` question — because it describes *your* message, not an
  extension note. The Nerd Font question mark is gone; the rule and timestamp
  carry the header.
- **Fixed: the card was one prompt behind.** pi emits `input` (and even
  `turn_start`) before the user message is appended to the session branch, so
  reading the branch there returned the previous question and nothing re-rendered
  once the message was committed (reported as "it does not update"). The submitted
  text is now shown optimistically and reconciled with the branch on
  `message_end`/`turn_end`/`agent_end`.
- **Fixed: the hint disappeared in a real terminal.** Padding was measured with
  `.length` on ANSI-styled strings and again on `⌥` (double-width), so the row
  overflowed and truncation ate the hint. Widths now come from pi-tui's
  `visibleWidth`, and rows are cut with `truncateToWidth`.
- Verified in a real pi TUI (pty + terminal emulator, 100x40): the card renders,
  follows a new prompt immediately, keeps the full `⌥Q expand` hint and the
  absolute timestamp.

## 0.2.0

- The strip is now a **pi-styled card**: `Box(1, 0, theme.bg("customMessageBg"))`
  background rectangle, an `accent` left rule on every row, the timestamp in
  `customMessageLabel`, the question in `customMessageText` and the shortcut hint
  right-aligned in `dim`. Rendered with pi's own primitives (Box + theme tokens)
  rather than plain strings, so it matches the surrounding UI in every theme.
- The hint degrades before the timestamp does (`⌥Q expand` → `⌥Q` → omitted), and
  every row is padded to the widget width, so narrow terminals stay aligned.
- The age label is replaced by an **absolute local timestamp**
  (`10/29/2026, 12:00 PM`). The widget only re-renders when the branch changes, so
  a relative "15s ago" would freeze and misreport how old the question is.

## 0.1.0

- Show the most recent user question in a two-line widget above the prompt box,
  with an age label and a `… ⌥Q` marker only when the text is cut.
- `ctrl+alt+q` expands the full question in a scrollable overlay; `enter` inserts
  it into the prompt box, `y` copies it there, `esc` closes.
- `ctrl+alt+j` jumps straight to the question by putting it in the prompt box,
  appending to anything already drafted.
- `/last-question` reports the text on surfaces without a TUI.
- The strip follows the branch: it updates on submit, on session start/resume and
  on tree navigation, and ignores assistant turns, tool results and custom
  entries. Newlines/space runs are flattened so pasted prompts stay tidy.

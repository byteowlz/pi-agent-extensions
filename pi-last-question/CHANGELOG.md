# Changelog

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

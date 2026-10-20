# Changelog

## 1.7.0

- Cap todo content with `maxContentLength` (default 160 characters, 0 = off).
  `write`/`add`/`update` truncate on a code-point boundary with `…`; the widget,
  `/todo list`, the tool result and the compaction reminder apply the same cap so
  previously overlong todos also render short.
- The `Todo` tool description now asks for one short line (~140 chars) and warns
  that overlong content is truncated.

## 1.6.0

- List only open todos. `completed`/`cancelled` items are never rendered line by
  line in the widget, `/todo list`, or the tool result — including expanded mode
  — and are summarized as `✓ N todos done` instead. Expanded mode still shows
  every *open* todo (no 5-item cap).

## Unreleased

- Consolidate commands under `/todo`: bare command opens the interactive menu; `list`, `expand`, `collapse`, and `toggle` control display. Remove `/todos`.

- Default the sticky TUI widget to one width-bounded progress row.
- Add `tuiWidgetCollapsed` (default `true`) and `/todos expand|collapse|toggle` session-only overrides, reset on session start/switch and tree navigation.
- Retain the expanded active task list and done count, Oqto payloads, storage identifiers, and independent completed-task tool-result expansion.
- Add configuration schema and pure renderer/lifecycle regression tests.

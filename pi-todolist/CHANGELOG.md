# Changelog

## Unreleased

- Consolidate commands under `/todo`: bare command opens the interactive menu; `list`, `expand`, `collapse`, and `toggle` control display. Remove `/todos`.

- Default the sticky TUI widget to one width-bounded progress row.
- Add `tuiWidgetCollapsed` (default `true`) and `/todos expand|collapse|toggle` session-only overrides, reset on session start/switch and tree navigation.
- Retain the expanded active task list and done count, Oqto payloads, storage identifiers, and independent completed-task tool-result expansion.
- Add configuration schema and pure renderer/lifecycle regression tests.

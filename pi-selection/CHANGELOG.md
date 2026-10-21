# Changelog

## 2.19.1

- Improve the ask panel's contrast and hierarchy. The yellow tint drops from 22%
  to 8% (muted text 2.80:1 -> 3.84:1, accent 2.24:1 -> 3.07:1, body text
  5.25:1 -> 7.20:1), body/description/decision use full `text` contrast, the
  question and spec titles are bold text instead of accent, and `muted` is
  reserved for chrome (tab strip, hints). The tab strip uses short header labels
  with separators and a blank line, and the panel gets bottom padding.

## 2.19.0

- `ask` now has a default 10-minute wait budget (`--selection-ask-timeout-ms`,
  0 disables, max 1 hour). On timeout the presentation is aborted, the draft is
  cancelled and a `SelectionTimeoutError` explains the budget and recovery.
- Report the calling Herdr pane as `blocked` while an `ask` waits, and release
  it on submit/cancel/timeout/error (best-effort, same contract as pi-sudo).
- Tests: timeout cancels the draft and reports a clear cause; `0` disables it and
  non-ask actions are unaffected; a fake Herdr CLI verifies the blocked/release
  args and the no-Herdr no-op.

## 2.16.0

- Improve the `ask` TUI. Every single/multiple question now always shows two
  extra visible rows: **✎ Enter your own answer…** and **— None of the above**.
  Free-text answers no longer require the legacy `allowOther` flag.
- "None of the above" is an explicit answer (`Answer.none`): it satisfies
  `required` and clears `minSelections`, and is distinct from unanswered,
  skipped and unsure. It cannot carry selections or text.
- Question block is rendered on a subtle yellow-tinted panel derived from the
  active theme (blend of `toolPendingBg` and `warning`), with spacing between
  the header, question, decision, options and notes. Plain-text rendering is
  unchanged when a host cannot style.
- The tool call line is summarized (`Selection · ask questions — Title`) instead
  of echoing the full JSON spec.
- Browser fallback gains the same "None of the above" button and "Your own
  answer" field, and its review summary reports explicit none.
- Tests cover explicit none (single/multiple/required/minSelections), own-answer
  rows, keyboard `0`, panel painting and browser source.

## Unreleased

- 2.10.2: support Python 3 stdlib `fcntl.flock` kernel locking on macOS and
  Linux without util-linux flock. Keep Linux flock compatibility, private
  persistent lock inodes, bounded acquisition/startup and fail-closed errors.
  Regression tests cover missing helper, cross-process exclusion, parent crash,
  backend interoperability and operation failure. Native Mac smoke test pending.

- 2.7.1: publish the complete Questions/Review spec schema to model tool discovery
  rather than opaque input. Add prompt-field/kind hints, complete example and
  question-index validation paths; preserve strict unknown-field rejection.

- 2.2.1: close controls accept caller-observed revision CAS; stale views cannot cancel a newer saved draft when the host forwards the observed revision.

- Content-only version 1 Questions and Review specs, shared validated results and private scoped revision-CAS store.
- Native TUI with search/groups/final review, text/notes and browser switch; protected tailnet-first browser with explicit token-protected LAN opt-in.
- Durable skipped/unsure deferrals, blank optional text and confirmed empty multi distinguish explicit input from unanswered.
- Optional type-only presentation-capabilities discovery and session-scoped control/status contract; no permission grants or arbitrary endpoint fetches.
- Host-neutral Bun CLI over the same store.
- Exact Pi 1.0 startup and RPC control tests prove standalone/optional capabilities handling without model/chat/history message pollution. Authenticated Oqto surface and deployment acceptance remain separate gates.

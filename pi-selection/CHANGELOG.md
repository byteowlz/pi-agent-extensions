# Changelog

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

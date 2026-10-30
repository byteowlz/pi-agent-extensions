# Changelog

## 3.1.0 (extension bundle)

- Keep tool descriptions focused on finding sessions and expanding source
  anchors. Leave parameter defaults in schemas and search-engine troubleshooting
  in documentation, not permanent prompt guidance.
- Preserve branch scope and incomplete-store warnings. Describe current-session
  exclusion as the configurable default, not a per-call tool argument.

## 2.13.0

- Move searches, reads, grep, branch enumeration, SQLite/index work and overlay
  previews into bounded cancellable process workers. Async handlers alone no
  longer leave synchronous history work on the Pi TUI event loop.
- Two active/eight queued requests, execution deadlines, bounded JSON IPC,
  session/shutdown cancellation and explicit worker errors. Preserve recall
  semantics and provenance; this is not a new retrieval engine or a sandbox.
- Open overlay without awaiting indexing; debounce and cancel obsolete queries.
- Ship a self-contained generated Node/Bun worker with freshness/copied-folder
  tests and responsiveness/CPU-bound cancellation/UTF-8 IPC regressions.
- Add isolated synthetic PTY startup probe. Fresh regular/fullscreen startup
  responds; large resumed-session rendering is measured separately. No claim
  that an affected user's unspecified startup hang is resolved.

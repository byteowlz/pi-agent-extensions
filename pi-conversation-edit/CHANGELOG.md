# Changelog

## 1.0.0

- Human `/rewrite` workflow: whole-message selection/filtering, built-in or
  operator-configured external editing, optional tool-less model rewrites,
  mandatory per-message diff review and final confirmation.
- Publish an independent native fork with branch-relative context edits; keep
  later context by default or explicitly restart after the last selected message.
- Preserve original source bytes, raw message metadata, tool history and existing
  context edits. Protect mixed blocks/compacted-away content and unsafe text.
- Private bounded editor files, staged no-overwrite publication, session/leaf
  fencing, capability toggles and `/rewrite inspect` for effective text previews.
- Synthetic SDK/session, command, model-input and external-editor regressions.

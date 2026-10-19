# Changelog

## 1.0.0

- New `/grab` command: extract copy-worthy atoms from the current session and
  copy the selection with OSC 52.
- Categories: URLs, paths, env assignments, tokens/secrets, IDs (issue IDs,
  UUIDs, SHAs) and network endpoints (`ip:port`, `host:port`), with fuzzy filter
  and category tabs.
- OSC 52 copy needs no clipboard binary and works over SSH/Herdr; tmux receives a
  DCS passthrough. Oversized values (>100 KB) fail closed and paste into the editor.
- Secret-looking values are redacted in previews (toggle with `v`); `p` pastes
  into the editor instead of copying. Current session only; nothing is uploaded,
  written to disk or sent to a model.
- Tests: extraction categories/dedupe/redaction, OSC 52 encoding/tmux/fail-closed,
  and the interactive picker (categories, filter, copy, paste, empty session).

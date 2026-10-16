# Changelog

## 1.3.0

- Sync Pi session titles to caller-owned Herdr tabs and tmux windows, preserving
  readable IDs in Pi. Add independent `syncTabTitle` toggle (default true).
- Resolve live explicit host IDs, verify Herdr session ownership, skip shared
  panes, revalidate before rename, and fence queued work on session replacement.
- One-way, bounded best-effort integration: no focus changes, Herdr core changes
  or fallback from failed Herdr to an outer tmux window.
- Regression coverage includes an isolated real tmux server; no live tabs are
  renamed during qualification. Refresh complete copied extension directories.

## 1.2.0

- Export canonical spawn-time naming for session tools: `[sub] Title [readable-id]`
  derived from the child session id, independent of inherited readable-id overrides
  and the automatic-renaming toggle. Preserve caller-provided titles, normalize
  duplicate prefixes/suffixes, and bound title length.

## 1.1.1

- Fix `/auto-rename <name>` dropping the readable-id suffix: the manual-rename path now always re-attaches the canonical readable id when `readableIdSuffix` is enabled (regenerated from the session id, or preserving any id already in the current name), so the id is never lost.

## 1.1.0

- Expose a `rename_session` tool so the agent can rename the session (title sans readable id); the readable-id suffix is generated automatically when `readableIdSuffix` is enabled.
- Regenerate the readable id from the forked session's id on `session_start` with reason `fork`, so branches get a distinct stable id.
- Make the test suite deterministic and host-independent (drop dependence on ambient `~/.pi/agent/auto-rename.json` or git cwd).

## 1.0.9

- Preserve the readable-id suffix when manually renaming sessions with `/auto-rename <name>` while `readableIdSuffix` is enabled.
- Avoid duplicating readable-id suffixes when generated or manual names already contain the readable id.

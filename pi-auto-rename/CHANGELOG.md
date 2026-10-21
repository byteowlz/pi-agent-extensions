# Changelog

## 1.5.0

- Add a routing description alongside the session name, stored as an
  append-only `pi-auto-rename:description/v1` custom session entry (never in
  LLM context, durable, travels with the file).
- `describe_session` tool (≤280 chars, ≤8 slug topics, control chars stripped,
  secret-shaped text rejected) and `/auto-rename describe [text|--clear]` for
  humans. Human text wins; the tool refuses to overwrite it.
- Forks re-append the description with `inheritedFrom` so inherited intent is
  visible. Emits `pi-auto-rename:described/v1` for in-process consumers.

## 1.4.1

- Keep the `[sub]` role marker in host tab titles so subagent tabs stay
  identifiable; only `[side]` is stripped for presentation. The canonical Pi
  name is unchanged, and inbound sync still round-trips without duplication.

## 1.4.0

- Add opt-in **inbound** tab-title sync (`syncTabTitleInbound`, default false):
  host tab renames are applied to the Pi session name, preserving the canonical
  readable id.
- Herdr listens to `tab.renamed` over the session socket via `events.subscribe`
  (no Herdr core changes). tmux uses a per-window `window-renamed` hook writing
  to a private inbox file, removed on shutdown.
- Verify ownership on every event (live single-pane tab matching this session's
  registered file); ignore foreign/hijacked/shared tabs. Strip id-shaped
  suffixes so a host cannot spoof the readable id. Suppress echoes of titles
  this extension just pushed. Sanitize and bound labels; host failures never
  break Pi naming. Stop listening on session replacement/shutdown.
- Tests: fake Herdr protocol server, real extension end-to-end over a socket,
  and isolated real tmux window-hook propagation.
- Add `/auto-rename sync` and `/auto-rename outbound` TUI toggles. Both persist
  to the effective config file (never clobbering invalid operator JSON). Inbound
  toggling starts/stops the listener immediately without a reload; `/auto-rename
  config` now reports both sync flags.

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

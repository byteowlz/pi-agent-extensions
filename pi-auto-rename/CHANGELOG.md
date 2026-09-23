# Changelog

## 1.1.1

- Fix `/auto-rename <name>` dropping the readable-id suffix: the manual-rename path now always re-attaches the canonical readable id when `readableIdSuffix` is enabled (regenerated from the session id, or preserving any id already in the current name), so the id is never lost.

## 1.1.0

- Expose a `rename_session` tool so the agent can rename the session (title sans readable id); the readable-id suffix is generated automatically when `readableIdSuffix` is enabled.
- Regenerate the readable id from the forked session's id on `session_start` with reason `fork`, so branches get a distinct stable id.
- Make the test suite deterministic and host-independent (drop dependence on ambient `~/.pi/agent/auto-rename.json` or git cwd).

## 1.0.9

- Preserve the readable-id suffix when manually renaming sessions with `/auto-rename <name>` while `readableIdSuffix` is enabled.
- Avoid duplicating readable-id suffixes when generated or manual names already contain the readable id.

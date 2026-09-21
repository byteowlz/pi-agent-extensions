# Changelog

## 1.1.0

- **oqto SSH proxy sessions.** When `OQTO_SSH_AGENT=proxy` is set (owned by
  oqto-runner), `ssh-key-load` no longer tries to `ssh-add` (the proxy blocks
  add-identity). Instead it requests a grant via `OQTO_SSH_GRANT_CMD` if
  present, or prints host-load + `[ssh].allowed_keys` guidance otherwise. The
  extension is a passive consumer of this env-var contract; the oqto-runner
  implements the grant side.
- **Grant contract settled.** The grant command uses a `status` enum
  (`granted|denied|pending|timed_out|error`); `pending` + `request_id` is the
  async completion signal, re-polled via `op: "status"` until terminal or a
  120s budget. Exit code means pipeline health (non-zero = `error`, not a
  denial). The loader kills the call at `timeout_secs` (default 60s) and cuts
  the poll loop at 120s, reporting `timed_out`.

## 1.0.0

- Initial release.
- `/ssh-key-load [path] [seconds]`: pick a private key from `~/.ssh` (or a named
  path) and add it to an ssh-agent; prompts for a passphrase through pi's masked
  UI when the key is protected, and supports an optional agent lifetime.
- Reuses the user's existing `SSH_AUTH_SOCK` when reachable, otherwise starts a
  dedicated pi-owned `ssh-agent` and sets `SSH_AUTH_SOCK`/`SSH_AGENT_PID` for the
  process.
- `/ssh-key-unload [path]` removes one key or tears down the agent + restores env.
- `/ssh-key-timeout [seconds]` sets the loaded keys' agent lifetime.
- `/ssh-key-status` reports the agent and loaded keys.
- Optional `ssh-key.json` config (`keyDir`, `defaultTimeout`).
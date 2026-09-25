# pi-ssh-key

Load an SSH private key into an `ssh-agent` scoped to the pi process, so every
command the agent shells out to (the `bash` tool, `git`, `scp`, sub-agents) can
authenticate with it. Pick a key, optionally enter its passphrase through pi's
masked UI, and bind its lifetime in the agent so it expires on its own — or
unload it when you're done.

## Install

```bash
pi install npm:@byteowlz/pi-ssh-key
```

Or for local development, drop the directory at
`~/.pi/agent/extensions/pi-ssh-key/` — pi auto-discovers it on startup.

## Why

A private key sitting in `~/.ssh` is useless to the agent: SSH connections made
from the agent's shell have no way to unlock a passphrase-protected key (there's
no TTY, so `ssh` prompts and hangs), and an unprotected key is normally only
picked up if `SSH_AUTH_SOCK` already points at an agent holding it.

This extension gives the agent a real, session-scoped agent and a one-command
way to populate it:

- **Load** — `ssh-keygen`-verified key discovery in `~/.ssh`, a fuzzy-search
  multi-select picker (type to filter, `space` selects, `a` selects all,
  `Enter` loads the selection — protected keys are marked `[locked]`), and a
  masked passphrase prompt that reaches `ssh-add` through `SSH_ASKPASS`
  (never a GUI askpass, never a TTY). Multiple selected keys are loaded one
  at a time, so passphrase prompts appear sequentially, one per key.
- **Scope** — the agent either reuses your already-running agent (so your other
  identities stay intact) or, if none is reachable, starts a dedicated
  `ssh-agent -a <private socket>` and points `SSH_AUTH_SOCK` / `SSH_AGENT_PID`
  at it for this process. Unload restores the environment exactly.
- **herdr-aware** — while a passphrase prompt is open, the pane is reported to
  herdr as `blocked` (source `pi-ssh-key`) so herdr's sidebar shows it
  correctly; state authority is handed back to herdr's detection afterwards.
- **Lifetime** — a key can be bound to an agent lifetime (`ssh-add -t`), so it
  forgets itself after a timeout.

## Commands

| Command                        | Description |
|--------------------------------|-------------|
| `/ssh-key-load [path] [seconds]` | Pick (fuzzy search, multi-select) or name one or more private keys and add them to the agent. Optional `seconds` bounds their lifetime in the agent (default: no expiry). |
| `/ssh-key-unload [path]`       | Remove one key, or with no argument remove all loaded keys and tear down the pi-owned agent + restore the env. |
| `/ssh-key-timeout [seconds]`   | Set the lifetime of the currently loaded key(s) (`0` = no expiry) and remember it as the default for future loads. With no argument, shows the current default. |
| `/ssh-key-status`              | Show the agent socket, whether pi owns it, and the loaded keys (with fingerprints). |

## Examples

```text
/ssh-key-load                  # open the fuzzy multi-select picker
/ssh-key-load ~/.ssh/github   # load a named key
/ssh-key-load ~/.ssh/prod 1800 # load it, expire from the agent after 30 min
/ssh-key-timeout 3600          # give the loaded key a 1-hour lifetime
/ssh-key-unload                # drop it and stop the pi agent
```

After loading, `git@github.com ...`, `ssh user@host`, and `scp` run from the
agent will authenticate using the loaded key.

## Configuration

Optional `ssh-key.json` (project `.pi/ssh-key.json` overrides global
`~/.pi/agent/ssh-key.json`):

```json
{
  "keyDir": "~/.ssh",
  "defaultTimeout": 0
}
```

- `keyDir` — directory scanned by the picker (default `~/.ssh`).
- `defaultTimeout` — seconds applied to `/ssh-key-load` when no timeout is given
  (`0` meaning no expiry, the default).

## oqto SSH proxy sessions

When pi runs inside an [oqto](https://github.com/byteowlz/oqto) sandboxed
session, the SSH agent socket is an `oqto-ssh-proxy`, not a real `ssh-agent`:
keys stay on the host in your real agent and only keys granted to the work
directory can be used. In that situation this extension does **not** try to
`ssh-add` (the proxy blocks add-identity) — it routes to a grant request.

Relying on the proxy's socket path or wire protocol would couple the two
components, so the contract is a pair of environment variables **owned by
oqto-runner** and only consumed here (the `pi-env-ctx` ownership pattern):

| Variable | Meaning |
|---|---|
| `OQTO_SSH_AGENT=proxy` | Signals an oqto proxy-gated session. When set, `ssh-key-load` does not add identities. |
| `OQTO_SSH_GRANT_CMD=<path>` | Optional trusted executable to request a key grant. |

### Grant command contract

When `OQTO_SSH_GRANT_CMD` is set, `/ssh-key-load` runs it with one JSON object
on stdin and reads one JSON object back.

**Input** (stdin):

```jsonc
// submit a request (default `op`)
{ "op": "request", "key_path": "~/.ssh/forgejo", "fingerprint": "SHA256:...", "comment": "user@host", "timeout_secs": 60 }
// poll a previously-returned pending request for its completion
{ "op": "status", "request_id": "red-hawk-123" }
```

**Output** (stdout, always a JSON object):

```jsonc
{ "ok": true, "status": "granted|denied|pending|timed_out|error", "message": "awaiting your approval", "request_id": "red-hawk-123" }
```

### Settled semantics

- **Completion signal.** `status: "pending"` is non-terminal: the runner returns
  it (with a `request_id`) immediately for genuinely async approval (e.g. a
  phone prompt), and pi-ssh-key re-polls `op: "status"` every 2s until a
  terminal status (`granted`, `denied`, `timed_out`, `error`) or a 120s budget
  is exhausted. A runner that can decide synchronously simply blocks and
  returns a terminal status directly — no polling.
- **Exit code = pipeline health, not the decision.** Exit `0` means the grant
  responder processed the request and stdout is authoritative. Any non-zero exit
  is treated as `status: "error"` (the grant pipeline crashed) — it is **not** a
  user denial. The user's decision lives in `status`.
- **Call timeout.** pi-ssh-key kills the grant command if it has not returned
  within `timeout_secs` (default 60s) and reports `timed_out`; the poll loop is
  likewise cut at the 120s budget.

If `OQTO_SSH_GRANT_CMD` is absent, `/ssh-key-load` prints guidance instead: load
the key on the host and grant it in the workdir's `[ssh].allowed_keys`.

The oqto-runner side (setting these vars and implementing `OQTO_SSH_GRANT_CMD`
against its prompt/approval system) is tracked separately in oqto. This
extension is deliberately a passive consumer of the contract.

## Security

- The passphrase is held only in module-local memory (never written disk or
  logs), and is passed to `ssh-add` via the process env of a short-lived askpass
  script that is deleted immediately after use.
- The passphrase cache is cleared on `/ssh-key-unload` and on session shutdown.
- If pi owns its agent, the agent is terminated and the previous
  `SSH_AUTH_SOCK`/`SSH_AGENT_PID` restored on unload and shutdown.
- When the user's own agent is reused, only the keys this extension added are
  removed on unload — the user's other identities are left untouched.

## Requirements

OpenSSH `ssh-agent`, `ssh-add`, and `ssh-keygen` on `PATH` (present by default
on macOS and most Linux distributions).
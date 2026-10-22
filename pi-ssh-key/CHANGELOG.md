## Unreleased

- `request_ssh_access` auto-approves when the requested key (or, without
  `key_path`, any key) is already granted and still live in the agent; no
  prompt, and the existing lifetime is not extended.

- Add isolated real-agent command lifecycle coverage for load/unload/reload:
  unload-all and individual paths, inherited and owned agents, plain and
  encrypted generated keys. Reported reload failure remains unreproduced.

- Add `request_ssh_access` with explicit human approval, separate bounded approval
  timeout and SSH key TTL, cancellation guards, redacted errors and Herdr cleanup.
- Reuse local picker/masked passphrase and ssh-agent loading; refuse proxy tool
  grants until the backend guarantees TTL and cancellation.
- Add deadline regression tests and update registration test fixtures.

# Changelog

## 1.4.0

- Publish an `ssh-key` footer status while keys are loaded: key count plus the
  soonest remaining timeout (e.g. `2 keys · 29m`). Track per-key expiry, drop
  expired keys from the status, refresh every 5s, and clear on unload/shutdown.
- Rendered as a Nerd Font key glyph (`\uF084`) by the pi-statusline example; works with any renderer via
  `ctx.ui.setStatus`.
- Tests: real-agent load publishes and unload clears the status; pure status
  formatting covers counts, soonest expiry and expired keys.

## 1.3.0

- Key picker marks keys already present in the agent with `[loaded]`, shows a
  loaded count in the header, and includes "loaded"/"locked" in the fuzzy match
  so `loaded` filters to what the agent already holds.
- Apply the configured `defaultTimeout` to `/ssh-key-load`. It was read but never
  used before. Precedence is now: explicit load timeout → session value set by
  `/ssh-key-timeout` → config `defaultTimeout` → no expiry.
- `/ssh-key-timeout` with no argument reports the effective default and whether
  it came from the session or the config file.
- Tests: real temporary `ssh-agent` asserts the `[loaded]` badge and filtering;
  config/session timeout precedence and rejection of negative values.

## 1.2.2

- Require Ctrl+A to toggle selection of all filtered keys. Plain a/A now remain
  filter input instead of unexpectedly selecting every SSH key.
- Update picker help and cover actual picker input/render/selection behavior.

## 1.2.1

- Probe cached and inherited agents with a bounded SSH protocol round trip;
  a socket inode or missing PID no longer passes as a live agent. Empty agents
  and policy proxies refusing identity enumeration are correctly recognized.
- Follow changed inherited sockets, clear stale cached keys/passphrases, and
  refuse stale unload/timeout operations or private fallback for unavailable
  inherited govnr/forwarded/host agents. Lost owned agents restart keyless.
- Fence pending connection work on shutdown; don't signal known-stale owned
  PIDs, and remove absent environment variables instead of assigning the
  literal string `undefined`. Report failed loads as errors (mixed as warnings).
- Regression coverage uses synthetic keys, real Unix sockets and a real
  disposable ssh-agent; no private user keys or history are read.

## 1.2.0

- **Fuzzy multi-select key picker.** `/ssh-key-load` now opens a picker with a
  type-to-filter search box (matches key name, comment, and path), checkbox
  multi-select (`space` toggles, `a` selects all), and `Enter` loads the
  selected keys — or the highlighted one when nothing is selected. Protected
  keys are marked `[locked]` (was an emoji).
- **Sequential passphrases.** Multiple selected keys are loaded one at a time
  in picker order, so passphrase prompts appear sequentially, one per key;
  per-key failures no longer abort the remaining loads.
- **herdr blocked state.** While a passphrase prompt is open, the pane is
  reported to herdr as `blocked` (source `pi-ssh-key`), since herdr's screen
  detection cannot classify the custom prompt UI; `working` + authority
  release is reported once the prompt resolves.

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
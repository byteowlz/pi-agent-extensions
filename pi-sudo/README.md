# pi-sudo

First-class `sudo` support for pi. Gives the agent local and remote sudo tools
that prompt for passwords through pi's own masked TUI, cache them in-process per
machine for the timestamp window, and block naked `sudo` in the bash tool so the
agent can never hang on an unanswerable password prompt or lock the account via
`pam_faillock`.

## Install

```bash
pi install npm:@byteowlz/pi-sudo
```

Or for local development, drop the directory at
`~/.pi/agent/extensions/pi-sudo/` — pi auto-discovers it on startup.

## Why

On Arch Linux, `/etc/pam.d/system-auth` ships `pam_faillock` enabled by
default. When pi (or any agent) shells out to `sudo` from a context without
a controlling TTY, PAM's conversation function fails, faillock counts that
as a failed password attempt, and three strikes in 10 minutes locks the
account — even though no password was ever typed.

This extension removes the trigger by:

- Never letting interactive `sudo …` run from the `bash` tool.
- Detecting obvious `ssh host sudo …` commands and routing the agent to a remote-specific tool.
- Piping the password on stdin via `sudo -S`, which has no TTY requirement.
- Prompting the user only once per timestamp window, through pi's native UI.

## Tools

### `sudo_exec`

```ts
sudo_exec({
  command: string,    // shell command; local: bash -lc, remote: sudo bash -lc over ssh
  host?: string,      // omit = local; set = run on this ssh destination
  sshOptions?: string, // optional simple flags like "-p 2222 -i ~/.ssh/key" (with host)
  reason?: string,    // shown to the user in the password prompt
  timeout?: number,   // ms, default 120000, max 30min
})
```

One tool for root, local or remote. Without `host` it runs locally; with
`host` (a server, `user@server`, or `~/.ssh/config` Host alias) the command is
executed as `sudo -S -p '' -- bash -lc <command>` over the user's normal SSH
setup (agent, keys, config, known_hosts) — use it instead of `bash` commands
like `ssh host sudo systemctl restart foo`.

On first use per machine, pi shows a masked password prompt with the command
and reason. Passwords are cached per scope — `local` and one per `remote:<host>`
— so a remote password never mixes with the local one or with other hosts.
Auth failures clear the scope's cache immediately and retry up to three times,
then return a hard error to the LLM. The password is piped over stdin; it is
never placed in argv, env, or files.

The LLM is instructed (via `promptGuidelines`) to use this tool whenever root
is needed. The built-in `bash` tool is guarded: interactive `sudo …` — locally
or inside obvious `ssh … sudo` invocations — is blocked with an error pointing
at `sudo_exec`. `sudo -n …` (non-interactive credential check) is still allowed
since it cannot hang.

`remote_sudo_exec` still exists as a deprecated alias (it forwards to
`sudo_exec` with `host`) so sessions loaded before the unification keep
working; new sessions only see `sudo_exec`.

## Commands

| Command         | Description |
|-----------------|-------------|
| `/sudo-status`  | Show cached passwords with remaining TTL / turns, plus the active policy |
| `/sudo-ttl <seconds> [turns]` | Change the session's cache policy: time-based and/or turn-based validity (0 = no expiry / unlimited turns) |
| `/sudo-forget`  | Drop the cached password immediately |
| `/sudo-test`    | Verify the cached password with `sudo true` |

## Configuration

`pi-sudo.json` — searched in `./`, `./.pi/`, then `~/.pi/agent/` (first match
wins; see `pi-sudo.schema.json` / `pi-sudo.example.json`):

- `defaultTimeoutMs` — default command execution timeout (per-call `timeout`
  parameter overrides); default 120000.
- `promptTimeoutMs` — auto-cancel the password prompt after this many ms
  without an answer, so an unattended agent is not blocked forever; default
  120000, `0` waits indefinitely. The prompt shows a live countdown.
- `cacheTtlMs` — how long a cached password stays valid; default 300000
  (5 min, matching sudo's timestamp_timeout), `0` disables time-based expiry.
- `cacheTurns` — how many completed agent turns a cached password stays valid
  for; default `0` (unlimited). Time and turn limits both apply when set.
- `maxPromptAttempts` — attempts before giving up after wrong passwords; default 3.

While a password prompt is open, the pane is reported to herdr as `blocked`
(source `pi-sudo`), so herdr's sidebar shows it correctly; the state is handed
back to herdr's own detection once the prompt resolves.

## Security

- The password lives in one module-local `string | undefined`. It is
  cleared on session shutdown, TTL expiry, auth failure, and `/sudo-forget`.
  JavaScript strings are immutable, so dropping the reference is the best
  cleanup the runtime allows.
- The password is written to `sudo`'s stdin and the stream is closed
  immediately. It never touches argv, env vars, files, or logs.
- Tool result `details` contain the command, reason, exit code, stdout,
  and stderr — never the password. The `[sudo] password for …` echo line
  is stripped from stderr before being returned.
- The extension performs no disk writes and opens no network sockets.

## Recommended companion: fix the PAM stack

This extension handles pi's side of the problem. To stop *any* tool on
the machine from triggering the same lockout, also remove `pam_faillock`
from sudo's PAM stack (interactive logins via getty/SSH/SDDM remain
faillock-protected). On Arch, replace `/etc/pam.d/sudo` with:

```
#%PAM-1.0
auth       [success=2 default=ignore]  pam_unix.so          try_first_pass nullok
auth       [success=1 default=bad]     pam_systemd_home.so
auth       optional                    pam_permit.so
auth       required                    pam_env.so
account    include                     system-auth
session    include                     system-auth
```

After editing, reset any pending lockouts with `faillock --user $USER --reset`
and verify in a separate terminal with `sudo -k && sudo -v` before closing
your existing root shell.

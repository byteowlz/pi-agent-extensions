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
  command: string,    // shell command, run via `bash -lc`
  reason?: string,    // shown to the user in the password prompt
  timeout?: number,   // ms, default 120000, max 30min
})
```

On first use, pi shows a masked password prompt with the command and
reason. The password is cached in-process for 5 minutes (matching sudo's
default `timestamp_timeout`). Auth failures clear the cache immediately and
retry up to three times, then return a hard error to the LLM.

The LLM is instructed (via `promptGuidelines`) to use this tool whenever local
root is needed. The built-in `bash` tool is guarded: any command starting with
interactive `sudo …` is blocked with an error telling the LLM to use `sudo_exec`
instead. `sudo -n …` (non-interactive credential check) is still allowed since it
cannot hang.

### `remote_sudo_exec`

```ts
remote_sudo_exec({
  host: string,        // ssh destination: server, user@server, or ~/.ssh/config Host
  command: string,     // remote root command, run via sudo bash -lc
  sshOptions?: string, // optional simple flags like "-p 2222 -i ~/.ssh/key"
  reason?: string,     // shown to the user in the password prompt
  timeout?: number,    // ms, default 120000, max 30min
})
```

Use this instead of `bash` commands like `ssh host sudo systemctl restart foo`.
The extension prompts for the remote machine's sudo password and caches it under
`remote:<host>`, separately from the local password and from other hosts. SSH
itself still uses the user's normal SSH setup (agent, keys, config, known_hosts).
The sudo password is piped to the remote `sudo -S -p '' -- bash -lc <command>`
over the SSH process stdin; it is never placed in argv, env, or files.

## Commands

| Command         | Description |
|-----------------|-------------|
| `/sudo-status`  | Show cache state and TTL remaining |
| `/sudo-forget`  | Drop the cached password immediately |
| `/sudo-test`    | Verify the cached password with `sudo true` |

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

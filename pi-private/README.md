# pi-private

`/private` starts a fresh, isolated Pi session. On a clean exit, **each Pi `.jsonl` session file is encrypted separately with age** as `<filename>.jsonl.age`; no encrypted disk image or volume is created. `/private nohistory` additionally omits the history-search extension and all other optional extensions. Both profiles **require age**: if the age executable or key setup fails, Pi is not started. Nothing in this repository changes the global Pi installation or installs age.

## Storage and encryption lifecycle

The printed vault directory contains `active/` (0700, Pi's session directory while live), `sealed/` (0700, encrypted individual session files), an age recipient, and an age-protected identity. On a new password-mode vault, the launcher runs `age-keygen | age -p` using pipes, never writing the private identity unencrypted to disk. **Enter a passphrase before Pi starts and retain it.** Subsequent session-file encryption uses only its public recipient, so normal exit can seal automatically without asking for another password. Resume uses `age -d -i identity.age` and asks for the identity passphrase. No key or passphrase is passed in argv or environment.

**Plaintext JSONL files are present on disk under `active/` for the entire live Pi process.** On normal exit, all files must be encrypted and synced before the launcher deletes the plaintext. A hard crash, forced shutdown, failed age command, failed disk write, or tool that writes outside `active/` can leave plaintext on disk. The launcher reports failure, retains `active.lock` when plaintext remains, and refuses resume until recovery; it never reports sealing as successful in that state. File deletion does not securely erase SSD blocks or backups. This is age encryption of *closed* session files, **not** encrypted-at-rest storage while Pi is running. If you require no persistent plaintext even during a crash, this Pi extension alone cannot provide that guarantee; use a separately reviewed in-memory/OS storage strategy. Disk swap, terminal scrollback, provider traffic, logs, exports and other tools are outside its guarantee.

### Resume

Save the absolute vault directory printed at launch (not `active/`). Once the previous session has exited and the files are sealed, either run in the parent Pi:

```text
/private resume /absolute/path/to/private-XXXXXX
/private nohistory resume /absolute/path/to/nohistory-XXXXXX
```

or use a standalone terminal from this checkout:

```bash
bun pi-private/cli.ts --resume /absolute/path/to/private-XXXXXX
bun pi-private/cli.ts nohistory --resume /absolute/path/to/nohistory-XXXXXX
```

The launcher verifies the profile and age mode, decrypts each `.jsonl.age` into `active/`, then starts Pi with `--continue`. Incorrect passphrases or a failed decrypt remove partial plaintext and **do not start Pi**. Old plaintext vaults from pi-private 0.1.0 are *not* automatically migrated or treated as encrypted.

### Recovery after a crash or failed seal

First verify that no Pi or pi-private wrapper still uses this vault. A stale `active.lock` is a safety stop, not proof that the process is gone. Inspect the plaintext `active/` files, remove only the stale lock after verifying the process has exited, then run `bun pi-private/cli.ts [nohistory] --seal /absolute/path/to/vault`. This retries age sealing without starting Pi. If age cannot finish, the plaintext remains and the lock is retained. Do not delete the only plaintext copy until an encrypted archive has been verified and backed up. Unknown files in `active/` or `sealed/` stop sealing rather than being silently ignored.

## Optional recipient / YubiKey mode

Instead of a passphrase-protected local identity, configure a public age recipient and private identity file *before* creating a vault in `~/.config/pi-private/config.json` (0600):

```json
{
  "age": {
    "recipient": "age1yubikey...",
    "identityFile": "/absolute/path/to/yubikey-identity.txt"
  }
}
```

For a YubiKey recipient, install `age-plugin-yubikey` as well as `age`; the identity file must be owned and 0600. A synthetic preflight file is encrypted and decrypted with this recipient/identity **before Pi starts**, requiring the plugin to be available. The recipient and identity *path* appear in process arguments; the secret identity contents and PIN do not. Actual YubiKey hardware was not available for testing. Changing a vault's age mode or recipient is refused. Back up both the age identity and encrypted files; losing the identity or passphrase makes sessions unrecoverable.

## Profile and shell isolation

Both profiles start Pi with `--no-extensions --no-mcp --no-skills --no-prompt-templates --no-themes --no-context-files` and an explicit `-e` allowlist. `/private` includes this extension plus its trusted sibling `pi-history-search/index.ts` by default; a missing sibling fails. Additional extensions may be configured in `config.json` (`private.schema.json`, `private.example.json`). `/private nohistory` loads only pi-private: no history search, codemode, tool-search or MCP tools. Built-in `bash` can still run searches; nohistory is not an OS-level prohibition on searching files.

Herdr uses a new tab with `--env` and runs a wrapper that checks age before starting Pi; tmux has a window fallback, and `bun pi-private/cli.ts` supports a standalone terminal. No parent conversation is forked. `KOMPRESS_ROLLING=0`, a private Atuin filter and disabled ordinary shell history are propagated. The calling shell for a standalone command can still record the vault path (never a passphrase). `PI_CODING_AGENT_SESSION_DIR` points at `active/` for children that inherit the environment; other tools and subagents can override or lose it. Only the `active/` JSONL files are automatically sealed.

## Verification and limits

`bun test pi-private/launch.test.ts` checks profiles with real Pi RPC startup and tests seal, unlock, failed decrypt, failed seal, permissions and Herdr argument propagation using a **mock age executable**. `tsgo --config pi-private/tsconfig.json` and `bunx biome check pi-private/` check this package. **Real age and YubiKey integration have not been tested here because age is not installed on this machine**; the launcher fails closed until it is installed. Repository-wide checks may have unrelated baseline failures. The separate `archive.ts` manual exporter remains optional and does not replace automatic per-file sealing.

# pi-nym

Redact the current Pi session locally with [nym](https://github.com/byteowlz/nym) before it goes to a cloud model.

## Commands

- `/nym` scans a snapshot of the session with `nym traces anon`, shows every value it would replace, and lets you untick what may stay. Values are grouped into categories (secrets, names, emails, ...): Space on a category toggles all its values, Space on a value toggles just that one, ←/→ fold categories, Ctrl+A toggles everything visible, and typing filters. Long lists open as a folded category overview. The redacted copy becomes a new session in the same project and Pi switches to it. Only the first scan runs detection: the reviewed values are applied directly, and repeated scans of a grown session reuse nym's NER cache. Pseudonyms are consistent within the session.
- `/nym-restore` decrypts a backup and switches back to the original session.

## The original session

`/nym` asks what to do with the unredacted original:

- **Encrypted backup** (default): original session and nym's replacement key, encrypted with GnuPG (AES-256) to `$XDG_DATA_HOME/pi-nym/backups`. The passphrase is a random secret stored in kyz (`pi-nym/backup`, created on first use) and only passed to gpg through `kyz pipe`. The backup is decrypted and compared before the plaintext original is removed. Needs `gpg` and an unlocked kyz vault. Manual recovery: `kyz pipe pi-nym/backup -- gpg --batch --pinentry-mode loopback --passphrase-fd 0 --decrypt FILE`, then take the `session` field.
- **Keep**: leave the original file as it is.
- **Remove without backup**: irreversible.

Removing a file is not a secure erase; filesystem snapshots and backups (e.g. Time Machine) may still hold the original.

## Guard

When you switch to a model whose provider is not listed in `localProviders` and the session has content that was not redacted, pi-nym warns, and (`guard: "confirm"`) asks before sending the next prompt. Declining keeps your prompt in the editor.

## Limits

- Only the session is redacted. Pi's system prompt (including context files such as AGENTS.md and the working directory) is sent separately and is not changed.
- New tool output after redaction is not redacted.
- Embedded images are kept and not scanned.
- The session header (local metadata, never model context) keeps the original working directory.

## Configuration

`./pi-nym.json`, `./.pi/pi-nym.json` or `~/.pi/agent/pi-nym.json` (first match wins). See `pi-nym.example.json` and `pi-nym.schema.json`. Sensitive and never-replace terms come from nym redaction profiles (`nym profiles`); `profiles` adds named ones to `default`.

Requires a nym with `traces anon --plan`. pi-nym warns at session start when `nym` on PATH is missing or too old, and falls back to the newest local build under `$XDG_DATA_HOME/nym/builds`.

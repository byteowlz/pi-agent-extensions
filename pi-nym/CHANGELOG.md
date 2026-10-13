# Changelog

## 0.1.0

- `/nym` redacts the current session locally with `nym traces anon`: scan a snapshot, choose values in a grouped checklist (all selected by default, secrets first, context preview), redact into a new session file and switch to it. Selected values still present afterwards (short numbers, dates, URLs that nym only replaces where detected) require confirmation.
- The original can be stored as a verified GnuPG AES-256 backup with a random passphrase kept in kyz (passed only through `kyz pipe`), kept, or deleted. `/nym-restore` decrypts a backup back into a session.
- Guard: switching to a model whose provider is not in `localProviders` while the session has unredacted content warns, and by default confirms before the next prompt is sent.
- Warns at session start when `nym` is not on PATH or too old for `traces anon --plan`.

# Changelog

## 0.3.0

- Categories are rows in the redaction menu: Space on a category selects or unselects all its values, `[-]` marks partial selections, and ←/→ fold and unfold categories. Lists longer than the view open as a folded category overview with sample values; typing a filter searches inside folded categories.

## 0.2.0

- Progress bar above the editor while nym scans and redacts (`scanning session (1/2)`, `redacting (2/2)`), driven by `nym traces anon --progress-json`; it never moves backwards. Requires a nym with `--progress-json`; older builds are reported at session start.

## 0.1.0

- `/nym` redacts the current session locally with `nym traces anon`: scan a snapshot, choose values in a grouped checklist (all selected by default, secrets first, context preview), redact into a new session file and switch to it. Selected values still present afterwards (short numbers, dates, URLs that nym only replaces where detected) require confirmation.
- The original can be stored as a verified GnuPG AES-256 backup with a random passphrase kept in kyz (passed only through `kyz pipe`), kept, or deleted. `/nym-restore` decrypts a backup back into a session.
- Guard: switching to a model whose provider is not in `localProviders` while the session has unredacted content warns, and by default confirms before the next prompt is sent.
- Warns at session start when `nym` is not on PATH or too old for `traces anon --plan`.

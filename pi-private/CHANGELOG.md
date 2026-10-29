# pi-private changelog

## 0.2.0

- Encrypt individual session JSONL files with age after Pi exits; decrypt for explicit resume. Use a passphrase-encrypted age identity by default, with an optional recipient/identity configuration for YubiKey plugins. Reject failed unlocks and seals without claiming protection for live or crash-left plaintext.

## 0.1.0

- Added isolated fresh-session `/private` and `/private nohistory` profiles, explicit extension allowlist, secure session directory, Herdr/tmux launch, standalone CLI with explicit resume, and regression tests.
- Added a manual offline age recipient archive helper. Password-protected/YubiKey-gated live-session encryption is not implemented; plaintext-session caveat documented.

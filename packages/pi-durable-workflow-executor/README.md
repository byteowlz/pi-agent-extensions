# Isolated native executor (experimental)

See `../../pi-durable-workflow/README.md` for scope, security boundaries and qualification commands.

Exact pi-durable/pi-ai/chord1.0.4 dependencies are isolated from ordinary Pi1.0.0. `npm ci --ignore-scripts`, then `npm run build`, then Node24.14.1 `cli.mjs qualify`. Build output is generated/ignored. CLI production run/schedule operations deliberately do not exist.

Trusted-host `runOccurrence(proposal, occurrenceId, adapters)` requires `authorize`, `models`, and `storeDir`; optional `context` is a Chord context. Authorization sees `phase:'admit'`, then `phase:'request'` with native conversation/task IDs. The host must resolve actual outstanding native task ownership, current grants and frozen job/runtime policy—not trust a model-supplied boolean or review metadata. Authorization denial/exception must never reach the provider. No hard resource isolation or generated tool execution is claimed.

Native receipts distinguish `effects:'none'` before filesystem/model work from conservative `effects:'possible'` after entering native storage. Output truncation is UTF-8 safe; opaque identity fields are not clipped. The duration intent configures stream timeout only; it is not a total wall-clock/CPU limit. SQLite lease is released by OS process termination, but abrupt-crash recovery itself is not yet qualified.

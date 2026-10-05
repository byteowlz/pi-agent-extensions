# Changelog

## 2.0.2

- Associate persisted slot state with the owning session UUID. CLI startup forks
  cannot inherit/reclaim a parent's slot, including ownerless legacy entries.
  Preserve ordinary legacy resumes and restores of a fork's own explicit claims.
- Release live listeners on same-process session identity replacement. Launching
  a separate side process leaves the parent's connection untouched.
- Add isolated parent/child ownership and restore regressions plus native Pi 1
  startup-fork coverage.

## 2.0.1

- Bound Save for Later list/read structured projections to 32,000 UTF-8 JSON
  bytes, advertise metadata truncation and omitted entries, and preserve opaque
  item/preparation IDs. Reject oversized identity metadata without altering it.
- Keep the budget implementation within this standalone package; persisted
  parked content is unchanged and agent reads remain non-destructive.

## 1.4.0

- Accept every MIME type, including PDFs and document formats.
- Use xlatch's executor-provided file path for resumable uploads, copy files of any configured size into `~/xlatch/incoming`, and send only the resulting local path to Pi.

## 1.3.0

- Include successful typed Save for Later preparation results as cached context alongside the original content.
- Keep interactively selected items parked while their configured preparation action is still running.

## 1.2.0

- Add the `xlatch_later` tool and `/xlatch later` picker for retrieving durable parked content without claiming a live Pi slot.
- Keep agent reads non-destructive; the interactive picker removes an item only after Pi accepts the message.

## 1.0.1

- Bind each connection to a private socket and publish its stable slot as an exclusive symlink. Closing an old listener cannot unlink a replacement listener.
- Stop pruning sockets after probe timeouts; reclaim only known-dead owners with serialized cleanup.
- Check connection health every three seconds, restore missing owned routes, show offline status, and report reconnect failures.
- Cancel connection setup across session changes and accept one delivery per adapter connection.

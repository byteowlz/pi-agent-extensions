# xlatch-session

Share text or a link from your iPhone straight into **one specific running pi
session**. The session appears in the iOS share sheet as a normal xlatch action.

## Chain

```
iPhone share sheet
  -> xlatch daemon (user mode, same UID)
  -> adapter  ~/.pi/agent/xlatch-pi/adapter.py     (xlatch JSON on stdin)
  -> private Unix socket  ~/.pi/agent/xlatch-pi/slots/<slot>.sock  (0600)
  -> pi extension -> pi.sendUserMessage(...)
  -> acknowledgment travels back to the phone
```

Nothing is exposed on the network. The bridge is a same-UID Unix domain socket
with mode `0600` in a `0700` directory.

## Slots: why the target is a named slot, not a session id

A **slot** is a stable named mailbox (`govnr`, `inbox`, …). A running session
claims a slot with `/xlatch`. The manifest pins `--socket <abs path>` in its
**fixed args**, so an action always addresses exactly one slot.

- Shared content carries no session selector, and the adapter explicitly
  ignores any `socket` / `session` / `slot` field in the payload. The phone
  cannot redirect content to a different session.
- The revision digest is **content-addressed**: identical manifest content
  yields the identical revision. So a slot is approved and granted **once**, and
  any session may later hold it without re-approval.
- Exactly one live session may hold a slot. A second session attempting the same
  slot is refused ("already held by another live pi session"). Stale sockets
  from crashed sessions are detected and reclaimed.

## Link lifecycle

| event | what happens to the link |
|-------|--------------------------|
| `/xlatch off` | released; the marker is cleared so it stays disconnected |
| clean exit (quit, SIGTERM) | `session_shutdown` releases the socket and drops the claim |
| crash / SIGKILL | socket and claim survive as stale; pruned on the next session start or `/xlatch` status |
| `/reload` | released, then **automatically reclaimed** |
| resume (`pi -c`, `-r`) | automatically reclaimed if the slot is free |
| `/new`, `/fork`, `/side` | **never** inherits the parent's slot |

A crashed session leaves a stale socket, but the phone still gets the correct
"pi session is not connected" message, because the adapter's connect is refused
rather than silently succeeding.

Reclaim polls briefly rather than checking once: on `/reload` the new extension
instance can start while the previous one still holds the socket.

## Broken registrations

A capability is bound to `execution.sha256`, so editing `adapter.py` invalidates
it. That state resolves itself rather than becoming dangerous:

- **Execution is fail-closed.** `validate_host_binding()` re-hashes the program
  before running it, so a mismatched adapter is never executed.
- **Re-registration auto-deactivates the old revision.** Reconnecting a slot
  registers the current manifest, which supersedes the previous approval; the
  old revision becomes `capability revision is not active` and the phone stops
  offering it, because only active *and* granted revisions are shown.
- `/xlatch` status lists any registration whose pinned digest no longer matches
  the adapter on disk, so the stale ones are visible without reading `xlatch list`.

The practical consequence: after editing the adapter, reconnect the slot and
approve the new revision. There is no `xlatch unregister`/`deactivate` command;
supersession by re-registration is the mechanism.

## Commands

| command | effect |
|---------|--------|
| `/xlatch` | Menu: connect / status / disconnect |
| `/xlatch <slot>` | Connect this session to `<slot>` directly |
| `/xlatch off` | Disconnect (closes socket, drops the claim) |

While connected, the footer shows `xlatch:<slot>` and a received count.

## Files, images, and notes

Shared files are **not** streamed into the session. The adapter writes them to
`~/xlatch/incoming` and sends only the resulting **path**, so the transcript
stays small and pi can open the file with ordinary tools:

```
Shared from phone via xlatch (file), saved to disk:

/Users/you/xlatch/incoming/chart.png

(image/png, ~184 KB)

Note from the sender:

What's in this chart? summarize briefly
```

A file may carry an optional **note** typed in the share sheet; both are
delivered together. Text alone still arrives as plain text.

The destination directory is fixed in the manifest args, never supplied by the
phone. Filenames from the phone are reduced to a safe basename
(`../../../evil photo.png` becomes `evil_photo.png`), and existing files are
never overwritten — collisions get a numeric suffix via `O_EXCL`.

### Size limit

xlatch caps a shared file at **4 MiB** (requests 8 MiB, results 6 MiB). The
manifest advertises `video/*` and `audio/*` so they appear in the share sheet,
but anything above that cap is rejected by the broker before it ever reaches the
adapter. For large media, share with the built-in `save.incoming` action
instead and hand pi the path.

## Delivery while idle or busy

Uses the real pi API, `pi.sendUserMessage(content, { deliverAs })`:

| session state | behavior | ack to phone |
|---------------|----------|--------------|
| idle | delivered immediately, triggers a turn | `delivery: "immediate"` |
| streaming/busy | `deliverAs: "followUp"` queues until the current turn's tools finish | `delivery: "queued"` |
| not connected | adapter cannot reach the socket | `"pi session is not connected. …run /xlatch…"` |

A file is written to disk **only after** the session socket answers, so a
disconnected session never litters `~/xlatch/incoming`.

`sendUserMessage` **throws** if the agent is streaming and `deliverAs` is
omitted, so `followUp` is always passed. Incoming content is prefixed
`Shared from phone via xlatch (text|link):` so its origin is explicit in the
transcript.

## First-time setup for a slot

1. In the target session: `/xlatch govnr`
   This registers `pi.send.govnr` **pending** and prints the exact revision.
2. Approve (host execution must be allowed explicitly):
   ```sh
   xlatch approve pi.send.govnr --revision <REV> --allow-host-execution
   ```
3. Grant it to the phone:
   ```sh
   xlatch devices                                    # find the device id
   xlatch grant <DEVICE_ID> pi.send.govnr --revision <REV>
   ```

**Protected mode instead:** local approval and grant changes are denied. Register
pending, then have the approver open the iOS app → **Server → Action approvals**,
review the exact manifest/revision, select devices, and sign with Face ID.

Reusing the slot later needs no new approval — the revision is unchanged.

### Undo

```sh
xlatch revoke <DEVICE_ID>        # remove device access
/xlatch off                      # stop listening in the session
```

## Editing the adapter invalidates approval

`execution.sha256` pins the adapter's bytes. Any edit changes the digest, which
changes the revision, which returns to **pending** and needs a fresh approval and
grant. That is the intended trust behavior, not a bug.

## Scope

- `accepts` advertises only `text/plain` and `text/uri-list`, which is what the
  bridge really delivers. The adapter defensively parses a `file` payload but the
  extension rejects it rather than pretend to support it.
- Commands are **trusted host execution**, not a sandbox. They run as the daemon's
  user with a cleared environment and fixed PATH, which is why the adapter uses
  the absolute system interpreter `/usr/bin/python3` and an absolute socket path.

## Does herdr matter here?

No, not for the bridge. The transport is pi ↔ xlatch over a local socket; herdr
is not in the path and the feature works in a plain terminal.

herdr is only useful *around* it: naming the tab that holds a slot, focusing that
tab when content arrives, and starting a session to hold a slot in the first
place. Delivery itself never touches herdr.

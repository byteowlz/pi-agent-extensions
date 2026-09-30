# Changelog

## 1.2.0

- Add the `xlatch_later` tool and `/xlatch later` picker for retrieving durable parked content without claiming a live Pi slot.
- Keep agent reads non-destructive; the interactive picker removes an item only after Pi accepts the message.

## 1.0.1

- Bind each connection to a private socket and publish its stable slot as an exclusive symlink. Closing an old listener cannot unlink a replacement listener.
- Stop pruning sockets after probe timeouts; reclaim only known-dead owners with serialized cleanup.
- Check connection health every three seconds, restore missing owned routes, show offline status, and report reconnect failures.
- Cancel connection setup across session changes and accept one delivery per adapter connection.

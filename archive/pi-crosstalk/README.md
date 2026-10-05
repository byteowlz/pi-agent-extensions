# crosstalk

Inter-session control for pi sessions via a local control socket.

This extension is adapted from Armin Ronacher's implementation in
`agent-stuff`.

## Features

- Per-session control socket at `~/.pi/crosstalk/<session-id>.sock`
- Send messages to other running sessions
- Get last assistant message or summaries
- Clear/rewind sessions
- Subscribe to turn-end events

## Usage

Start pi with the flag:

```bash
pi --crosstalk
```

The extension registers:

- `send_to_session` tool for inter-session messaging
- `/crosstalk-sessions` command to list controllable sessions

## Attribution

Original work by Armin Ronacher (agent-stuff). This copy preserves the
original behavior and license attribution.

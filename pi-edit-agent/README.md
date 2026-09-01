# pi-edit-agent

Edit an assistant (agent) message and continue from there — like `/tree`, but
you can edit the agent message at the selected point instead of just rewinding.

## Why

`/tree` lets you pick a point in the conversation and rewind to it. But you can
only rewind — you can't change what the agent *said* at that point. This
extension adds the missing piece: **edit an agent message, then let the agent
continue from the edited version.**

Typical uses:

- The agent misstated something; fix its message and let it build on the correction.
- The agent went down a path you want to nudge; rewrite its response and continue.
- Trim a verbose answer before continuing the conversation.

## Install

This extension lives in the `pi-agent-extensions` monorepo. Either symlink the
directory into your global extensions folder, or run pi from the repo:

```bash
# Option A: global auto-discovery
ln -s ~/byteowlz/pi-agent-extensions/pi-edit-agent ~/.pi/agent/extensions/pi-edit-agent

# Option B: project-local
ln -s ~/byteowlz/pi-agent-extensions/pi-edit-agent .pi/extensions/pi-edit-agent
```

Then `/reload` (or restart pi).

## Usage

```
/edit-agent            # picker (default = last assistant message)
/edit-agent last       # edit the last assistant message directly
/edit-agent 2          # edit the 2nd assistant message (oldest-first numbering)
```

Flow:

1. Pick an assistant message (or pass `last` / a number).
2. The message text opens in the editor. Edit and save.
3. A **new branch** is created from the message's parent with your edited text.
   The original branch is preserved in history — nothing is destroyed.
4. Choose **Continue** to have the agent pick up from the edited message, or
   **Keep edit only** to leave it in place and continue manually.

> The original message and everything after it stays on the old branch, so you
> can always get back to it via `/tree`.

## How it works

pi's session tree is append-only, so a message can't be mutated in place.
Instead, `edit-agent` branches off the target message's parent and appends the
edited message as a sibling, then re-reads the session file so the live agent
state and TUI refresh from disk. This keeps history intact and behaves like a
natural fork.

## Config

Optional. Place `edit-agent.json` in `./`, `./.pi/`, or `~/.pi/agent/`:

```json
{
  "continuePrompt": "I edited your previous message. Continue from there.",
  "defaultAction": "continue"
}
```

| key             | type                          | default                                                       | description                                              |
| --------------- | ----------------------------- | ------------------------------------------------------------- | -------------------------------------------------------- |
| `continuePrompt`| string                        | `"I edited your previous message. Continue from there."`      | User message sent to trigger the continuation turn.      |
| `defaultAction` | `"continue"` \| `"editOnly"` | `"continue"`                                                  | What happens when you press Esc on the "what next?" prompt. |

See `edit-agent.schema.json` / `edit-agent.example.json`.

## Notes

- Only the **text** of an assistant message is edited. Thinking blocks and tool
  calls are dropped on the new branch, so the agent re-plans from the edited
  text.
- Requires an interactive UI (TUI or RPC mode). Not available in print/JSON mode.
- In-memory (non-persisted) sessions append the edit but can't refresh the live
  view from disk; you'll see a notification instead.

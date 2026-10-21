# Changelog

## 2.1.0

- The continuation prompt is now sent as a **hidden custom message**
  (`display: false`, `triggerTurn: true`): the model still knows the previous
  message was edited, but no "I edited your previous message" turn appears in
  the transcript. Set `hideContinuePrompt: false` for the old visible behaviour.

## 1.0.0

- Initial release.
- Adds the `/edit-agent` command: pick an assistant message on the current
  branch, edit its text, branch from its parent with the edited text, and
  optionally have the agent continue from the edit.

# Delegate Extension

Spawns Pi subagents (separate Pi processes) to handle delegated tasks. Supports single-task, parallel tasks, and async execution with completion events.

## Tools

- `delegate` — run a single task or multiple parallel tasks
- `delegate_status` — inspect async runs

## Example

```json
{
  "name": "delegate",
  "arguments": {
    "task": "Summarize this repository",
    "agent": "summarizer"
  }
}
```

Parallel tasks:

```json
{
  "name": "delegate",
  "arguments": {
    "mode": "parallel",
    "tasks": [
      { "agent": "research", "task": "Check docs" },
      { "agent": "planner", "task": "Outline steps" }
    ]
  }
}
```

Async run:

```json
{
  "name": "delegate",
  "arguments": {
    "task": "Long-running task",
    "async": true
  }
}
```

Status:

```json
{
  "name": "delegate_status",
  "arguments": { "id": "<run-id>" }
}
```

## Notes

- Subagent sessions are written alongside the current Pi session with a `parentSession` header so Octo can render them as child sessions.
- The auto-rename extension can add a `subagent` prefix via `PI_SUBAGENT_PREFIX`.

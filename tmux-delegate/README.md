# Tmux Delegate Extension

Spawns Pi subagents in tmux windows for delegated tasks. Each task runs in a visible tmux window so you can watch progress live, and child sessions are created in the same session directory so Octo renders them nested under the parent session.

## Requirements

- `tmux` installed and in PATH
- Pi must be running inside a tmux session

## Tools

### TmuxDelegate

Delegate tasks to Pi subagents. Each task gets:

- A new tmux window (visible, switchable via `tmux select-window`)
- A child session file with `parentSession` pointing to the current session
- Output captured to a file via `tee`

**Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `task` | string | Task description (single mode) |
| `agent` | string | Agent name from `~/.pi/agent/agents/` |
| `cwd` | string | Working directory |
| `tasks` | array | Multiple tasks for parallel execution |
| `agentScope` | "user" / "project" / "both" | Agent discovery scope (default: "user") |
| `wait` | boolean | Block until completion (default: false) |

**Single task (async):**

```json
{
  "name": "TmuxDelegate",
  "arguments": {
    "agent": "researcher",
    "task": "Investigate the auth module for security issues"
  }
}
```

**Parallel tasks:**

```json
{
  "name": "TmuxDelegate",
  "arguments": {
    "tasks": [
      { "agent": "researcher", "task": "Check docs" },
      { "agent": "planner", "task": "Outline steps" }
    ]
  }
}
```

**Synchronous (wait for completion):**

```json
{
  "name": "TmuxDelegate",
  "arguments": {
    "agent": "worker",
    "task": "Refactor the auth module",
    "wait": true
  }
}
```

### TmuxDelegateStatus

Check progress and retrieve output from running or completed tasks.

| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | string | Run ID from a previous TmuxDelegate call |
| `tail` | number | Number of output lines per task (default: 50) |
| `output` | boolean | Include task output (default: false) |

```json
{
  "name": "TmuxDelegateStatus",
  "arguments": {
    "id": "a1b2c3d4",
    "output": true
  }
}
```

## How It Works

1. Creates a child session file in the same session directory with `parentSession` set to the current session file
2. Spawns `pi -p --mode text --session <child-session>` in a new tmux window
3. Output is piped through `tee` to both the terminal and a capture file
4. Exit code is written to a file when the process completes
5. Background polling detects completion and emits events

## Octo Integration

Child sessions have `parentSession` in their session header, which makes Octo:
- Show them nested under the parent session in the sidebar
- Display them as expandable child entries
- Track their status independently

## Agent Discovery

Agents are discovered from markdown files with frontmatter:

- `~/.pi/agent/agents/*.md` (user scope)
- `.pi/agents/*.md` (project scope, walk up from cwd)

Frontmatter fields: `name`, `description`, `tools` (comma-separated), `model`.

## Events

- `tmux-delegate:started` - emitted when a run starts
- `tmux-delegate:complete` - emitted when all tasks in a run finish

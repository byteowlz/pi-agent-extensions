# pi-todolist

A Pi extension that provides todo management tools compatible with Oqto's frontend todo panel.

## Overview

This extension provides a single unified `Todo` tool for managing the task list, plus an interactive `/todo` command. Todos created through these are automatically displayed in Oqto's right sidebar panel.

## Tools

### `Todo`

One tool for the whole todo lifecycle. `action` selects the operation:

- **write** - Replace the entire list at once
- **read** - List todos (optionally filtered by status/priority)
- **add** - Add a new todo
- **update** - Modify an existing todo by id
- **remove** - Delete a todo by id
- **clear** - Empty the list

```json
// Replace the whole list (write)
{ "action": "write", "todos": [
  { "content": "Implement authentication", "status": "in_progress", "priority": "high" },
  { "content": "Write unit tests", "status": "pending", "priority": "medium" }
] }

// Read, optionally filtered
{ "action": "read", "filter": { "status": "pending", "priority": "high" } }

// Add
{ "action": "add", "content": "New task", "priority": "high" }

// Update by id
{ "action": "update", "id": "abc123", "status": "completed" }

// Remove by id
{ "action": "remove", "id": "abc123" }

// Clear
{ "action": "clear" }
```

## Todo Structure

```typescript
interface TodoItem {
  id: string;       // Auto-generated if not provided
  content: string;  // Task description
  status: "pending" | "in_progress" | "completed" | "cancelled";
  priority: "high" | "medium" | "low";
}
```

## Frontend Integration

The Oqto frontend automatically parses `Todo` tool calls and displays todos in the right sidebar panel. The frontend looks for tool calls with:
- Name containing "todo"
- Input containing a `todos` array with the expected structure

## Commands

- `/todo` - Interactive menu to add, start, complete, cancel, edit, delete, or clear todos
- `/todos` - Display current todos in the notification area

## Configuration

Create `oqto-todos.json` in your project root, `.pi/` directory, or `~/.pi/agent/`:

The extension is named `pi-todolist`; the configuration filename and persisted
`oqto-todos` history/widget keys intentionally remain unchanged to preserve
existing settings and todo state.

```json
{
  "enabled": true,
  "debug": false,
  "sessionScoped": true,
  "storagePath": ".pi/todos",
  "tuiWidget": false
}
```

### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `enabled` | boolean | `true` | Enable/disable the extension |
| `debug` | boolean | `false` | Enable debug logging |
| `sessionScoped` | boolean | `true` | Store todos per session (vs. shared) |
| `storagePath` | string | pi session dir `todos` subdir | Directory for todo storage (defaults to `<pi-session-dir>/todos`) |
| `tuiWidget` | boolean | `true` | Render persistent todo widget in Pi TUI (set to `false` for Oqto-only frontend usage) |

The widget and the collapsed tool-result view show only active (pending /
in-progress) todos plus a single dim `✓ N todos done` line; expand a tool
result (or check `/todos`) to see done and cancelled entries individually.
| `preserveInCompaction` | boolean | `true` | After context compaction, inject the current todo list into the LLM context so the model keeps using the todo tools |

## Installation

### Global Installation

```bash
cp -r pi-todolist ~/.pi/agent/extensions/
```

### Project-local Installation

```bash
cp -r pi-todolist .pi/extensions/
```

### Development (Symlink)

```bash
ln -s $(pwd)/pi-todolist ~/.pi/agent/extensions/pi-todolist
```

## Storage

By default todos are stored under pi's session directory, in a dedicated `todos` subdir (so they never collide with the session file):

- **Session-scoped**: `<pi-session-dir>/todos/<session-id>.json`
- **Shared**: `<pi-session-dir>/todos/todos.json`

Set `storagePath` to override the location. If `storagePath` is omitted and a session directory is unavailable, the extension falls back to `./.pi/todos`.

### Forks, clones, and branches

Each session gets its own todo list (keyed by session id).

- **Branches (`/tree`)** stay within the same session file, so they share the same todo list.
- **Forks (`/fork`) and clones (`/clone`)** start a new session with a new id; the parent session's todo list is copied into the new session so the task list carries over.

## Compatibility

This extension is compatible with:
- Oqto's frontend todo panel
- Pi's extension system

The `Todo` tool output format matches exactly what Oqto's frontend expects, ensuring seamless integration.

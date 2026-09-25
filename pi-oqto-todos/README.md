# Oqto Todos Extension

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
| `storagePath` | string | `.pi/todos` | Directory for todo storage |
| `tuiWidget` | boolean | `true` | Render persistent todo widget in Pi TUI (set to `false` for Oqto-only frontend usage) |
| `preserveInCompaction` | boolean | `true` | After context compaction, inject the current todo list into the LLM context so the model keeps using the todo tools |

## Installation

### Global Installation

```bash
cp -r oqto-todos ~/.pi/agent/extensions/
```

### Project-local Installation

```bash
cp -r oqto-todos .pi/extensions/
```

### Development (Symlink)

```bash
ln -s $(pwd)/oqto-todos ~/.pi/agent/extensions/oqto-todos
```

## Storage

Todos are stored as JSON files in `.pi/todos/`:

- **Session-scoped**: `.pi/todos/<session-id>.json`
- **Shared**: `.pi/todos/todos.json`

## Compatibility

This extension is compatible with:
- Oqto's frontend todo panel
- Pi's extension system

The `Todo` tool output format matches exactly what Oqto's frontend expects, ensuring seamless integration.

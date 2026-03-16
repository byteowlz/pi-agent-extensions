# trx-picker

Browse, filter, and dispatch [trx](https://github.com/byteowlz/trx) issues from within a pi session.

## Install

```bash
pi install npm:pi-trx-picker
```

## Usage

Type `/trx` in any pi session to open the overlay.

## Features

- Lists all open trx issues sorted by priority
- Fuzzy search across id, title, type, priority, and status
- Multi-select issues with Space or Tab
- Cycle sort modes with Ctrl+S (priority, newest, oldest, recently updated, type)
- **Enter** sends selected issues to the current session for implementation
- **Shift+Enter** spawns a new tmux window with a fresh pi session working on the issues

## Keybindings

| Key | Action |
|-----|--------|
| `Up/Down` | Navigate issue list |
| `Space` | Toggle selection on current issue |
| `Tab` | Toggle selection and move to next |
| `Ctrl+S` | Cycle sort mode |
| `Ctrl+U` | Clear search query |
| `Enter` | Implement selected issues in current session |
| `Shift+Enter` | Implement in new tmux window |
| `Esc` | Cancel |

## Dependencies

- [trx](https://github.com/byteowlz/trx) -- issue and task tracking CLI (must be in PATH)
- [tmux](https://github.com/tmux/tmux) -- required for Shift+Enter (new window) functionality

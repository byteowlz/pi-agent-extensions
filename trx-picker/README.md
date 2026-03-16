# trx-picker

Browse, filter, and dispatch [trx](https://github.com/byteowlz/trx) issues from within a pi session.

## Usage

Type `/trx` in any pi session to open the overlay.

## Features

- Lists all open trx issues sorted by priority
- Fuzzy search across id, title, type, priority, and status
- Multi-select issues with Space or Tab
- **Enter** sends selected issues to the current session for implementation
- **Shift+Enter** spawns a new tmux window with a fresh pi session working on the issues

## Keybindings

| Key | Action |
|-----|--------|
| `Up/Down` | Navigate issue list |
| `Space` | Toggle selection on current issue |
| `Tab` | Toggle selection and move to next |
| `Ctrl+U` | Clear search query |
| `Enter` | Implement selected issues in current session |
| `Shift+Enter` | Implement in new tmux window |
| `Esc` | Cancel |

## Requirements

- `trx` CLI must be installed and available in PATH
- `tmux` required for Shift+Enter (new window) functionality

## Installation

Copy or symlink this directory into `~/.pi/agent/extensions/`:

```bash
ln -s /path/to/pi-agent-extensions/trx-picker ~/.pi/agent/extensions/trx-picker
```

Or add the path to your pi `settings.json`:

```json
{
  "extensions": ["/path/to/pi-agent-extensions/trx-picker"]
}
```

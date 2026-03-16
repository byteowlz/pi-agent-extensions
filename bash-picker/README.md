# bash-picker

Pick bash snippets from recent assistant messages and copy to clipboard.

## Usage

Type `/bash` in any pi session to open the overlay.

## Features

- Scans the current session branch for ` ```bash ` / ` ```sh ` / ` ```shell ` / ` ```zsh ` code blocks
- Shows snippets in a list, most recent first
- Preview the full snippet with Space/Tab
- Enter copies the selected snippet to clipboard
- Falls back to pasting into the editor if no clipboard tool is available

## Keybindings

| Key | Action |
|-----|--------|
| `Up/Down` | Navigate snippet list |
| `Space` / `Tab` | Toggle full code preview |
| `Enter` | Copy selected snippet to clipboard |
| `Esc` | Cancel (or close preview) |

## Requirements

One of: `xclip`, `xsel`, `pbcopy`, or `wl-copy` for clipboard support.
Falls back to pasting into the pi editor if none are available.

## Installation

Copy or symlink into `~/.pi/agent/extensions/`:

```bash
ln -s /path/to/pi-agent-extensions/bash-picker ~/.pi/agent/extensions/bash-picker
```

# bash-picker

Pick bash snippets from recent assistant messages and copy to clipboard.

## Install

```bash
pi install npm:pi-bash-picker
```

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

## Dependencies

One of these clipboard tools must be available for copy support (falls back to pasting into the pi editor):

- [xclip](https://github.com/astrand/xclip)
- [xsel](https://github.com/kfish/xsel)
- `pbcopy` (macOS, built-in)
- [wl-copy](https://github.com/bugaevc/wl-clipboard) (Wayland)

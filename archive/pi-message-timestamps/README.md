# pi-message-timestamps

TUI-only timestamp widget for user/assistant messages.

## Behavior

- Renders a lightweight widget **below the editor** with recent user+assistant messages.
- Shows timestamp style:
  - today: `HH:MM`
  - yesterday: `Yesterday HH:MM`
  - older: `YYYY-MM-DD HH:MM`
- Uses session history metadata only.
- **Does not modify message content** and does not alter model context.

## Notes

This is extension-only and render-only. It updates on session load/tree refresh and after each turn.

## Install

```bash
ln -s $(pwd)/pi-message-timestamps ~/.pi/agent/extensions/pi-message-timestamps
```

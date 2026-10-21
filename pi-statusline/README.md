# pi-statusline

Optional, **manifest-driven** status footer for pi. It renders the statuses that
extensions publish via `ctx.ui.setStatus(...)` as colored segments on one line,
instead of the built-in footer's separate dim line.

## Publisher/consumer separation (no hard dependency)

This extension is **not a dependency of any other extension**. The contract is:

- **Publish** — extensions call the core pi API `ctx.ui.setStatus(key, text)` to
  expose at-a-glance state. That is the only coupling; no extension imports
  `pi-statusline`.
- **Render** — optionally, this footer reads a central **manifest**
  (`statusline.json`) that maps each `statusKey` to a label, color and position,
  and renders the matching statuses. If this extension is not installed/enabled,
  the publishing extensions still work and the built-in footer shows their status
  on its default dim line.

So you can add/remove contributors and renderers independently.

## Manifest

Looked up in this order (first match wins):

1. `<cwd>/.pi/statusline.json`
2. `<cwd>/statusline.json`
3. `~/.pi/agent/statusline.json`

```json
{
  "version": 1,
  "showInactive": true,
  "icon": { "glyph": "π", "fallback": "pi", "color": "text" },
  "items": [
    { "id": "kompressor", "statusKey": "kompressor-rolling",
      "label": "KSP", "color": "warning", "position": "right", "order": 10 }
  ]
}
```

Item fields: `statusKey` (required, the key an extension publishes under),
`id` (defaults to statusKey), `label` (short prefix, default statusKey),
`color` (accent|success|warning|error|muted|dim|text), `colorValue` (also color
the published value, not just the label), `position`, `order`
(sort, ascending; default 1000). Top-level `showInactive` renders configured
items even when idle (dimmed).

Publishers decide severity by choosing the key; the renderer decides the color.
Sudo uses three mutually-exclusive keys so the shield changes color as time runs
out, while a plain `sudo` publisher keeps working if you only map one:

```json
{ "id": "ssh-key",    "statusKey": "ssh-key",    "label": "\uF084", "color": "accent",  "order": 120 },
{ "id": "sudo",       "statusKey": "sudo",       "label": "\uF132", "color": "success", "colorValue": true, "order": 130 },
{ "id": "sudo-warn",  "statusKey": "sudo-warn",  "label": "\uF132", "color": "warning", "colorValue": true, "order": 130 },
{ "id": "sudo-crit",  "statusKey": "sudo-crit",  "label": "\uF132", "color": "error",   "colorValue": true, "order": 130 }
```

The leading icon uses the **real pi press-kit badge** as an inline image on
terminals that implement the **Kitty graphics protocol**, drawn from
`assets/*.png`. Support is detected by asking the terminal at startup (a Kitty
graphics query answered with `OK`, with DA1 as the sentinel), not by matching
terminal names. Inside a multiplexer (herdr, tmux, zellij, screen) `auto` keeps
the glyph and skips the query: the multiplexer answers it, not the terminal you
are looking at, and herdr forwards images to every attached client, so an SSH
client without Kitty graphics (e.g. Terminus on iOS) would print the commands
as text. Set `"image": "on"` to opt in when every client you attach with
supports Kitty graphics. The project icon follows the same rule. The badge is sized to the statusbar height via `icon.rows` (1-2,
default 1). It is theme-aware: the white mark on dark backgrounds, the black
mark on light ones. On terminals that do not implement the protocol it falls
back to a theme-aware `π` glyph (white in dark, dark in light). Override with
`icon`: `{ "glyph": "π", "fallback": "pi", "color": "text", "rows": 1,
"image": "auto" }`, where `image` is `auto` (detect), `on` (force the
image), or `off` (force the glyph; also skips the query). See `statusline.schema.json` and
`statusline.example.json`.

On the right of the pwd line it shows the **cwd project's icon**, following the
byteowlz project icon standard: `icon/icon_on_dark` (for dark themes) or
`icon/icon_on_light` (for light themes), `.png` preferred over `.svg`, searched
from the cwd up to the git root. An SVG-only icon is rasterised once with
`rsvg-convert` (or ImageMagick) into `~/.cache/pi-statusline/`. No icon, no
matching variant, or no Kitty graphics: nothing is shown. Disable with
`"projectIcon": false`.

## Status-key convention

- One status per extension, published under a **kebab-case key equal to the
  extension id** (e.g. `history-search`, `oqto-bridge`, `tui-rpc`, `trx-picker`).
  This keeps keys collision-free and self-describing.
- The value is a compact single-line string (no newlines; pi sanitizes them). Use
  `ctx.ui.theme.fg(...)` for minor inline emphasis, but leave per-segment colour
  to the manifest so it is consistent across the footer.

## Install (optional)

```bash
ln -s $(pwd)/pi-statusline ~/.pi/agent/extensions/pi-statusline
```

Add a `statusline.json` manifest (copy `statusline.example.json` to
`~/.pi/agent/statusline.json`) and `/reload`.

## Alternative renderer

If you prefer a richer powerline bar, `pi-powerline-footer` can consume the same
`setStatus` keys via its `customItems` (`{ id, statusKey, position, prefix,
color, selfColorize }`). The manifest above is the neutral source of truth; map
it to that plugin's `customItems` if you use it. Either way the publishing
extensions stay decoupled.

### Inline indicators beside context

Manifest entries with status keys `ssh-key`, `sudo`, `sudo-warn`,
`sudo-crit`, `kompressor-rolling` (Kompressor), and `xlatch` render inline immediately after the context percentage/window gauge
in the stats/model row (before the right-aligned model). They are not repeated
on the separate status row. All other entries remain on that row.

Within each group, manifest ordering, label/value colors, published expiry
values, and `showInactive` behavior are unchanged. Narrow terminals truncate
the stats row with the existing ANSI-aware width handling; access indicators
may be clipped rather than wrapped or moved back to the status row.

After updating an installed copy, refresh/reload Pi to load the new code.
This source change alone does not update a separately installed copy.

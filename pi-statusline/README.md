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
`color` (accent|success|warning|error|muted|dim|text), `position`, `order`
(sort, ascending; default 1000). Top-level `showInactive` renders configured
items even when idle (dimmed). `icon` renders a leading glyph: `color` uses the
theme's `text` token by default so it is white on dark themes and dark on light
themes, and it falls back to `fallback` on clearly limited terminals
(`TERM=dumb|linux|cons25`). See `statusline.schema.json` and
`statusline.example.json`.

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
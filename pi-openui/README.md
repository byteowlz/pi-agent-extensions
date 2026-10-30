# pi-openui

Agent-generated UI in the Pi TUI: OpenUI Lang programs from the Oqto profile
([oqto-openui](https://github.com/byteowlz/oqto-openui), OpenUI's full 82-component
vocabulary) rendered natively in the terminal, with answers returned to the agent.
Decision: Oqto ADR-0074. Same programs render in Oqto Web, desktop and mobile.

## Use

```
/openui on        enable for this session (persisted in the session)
/openui off       disable: tool inactive, no prompt injected
/openui status
/openui demo [fixture]   preview a profile fixture locally (no model call)
```

When on, a short tool-scoped `openui` prompt section is added. The model-only
`openui` tool and read-only `openui_reference` tool become active. The model
requests syntax/component details from `openui_reference` as needed (6000
characters per page by default; follow `nextOffset`). No full profile prompt or
global response/data/style instructions are injected. The model calls `openui` with:

- `program`: OpenUI Lang (entry statement `root`)
- `fallback`: short plain text for hosts without UI
- `wait`: `true` to wait for the user's `@Answer`, returned as the tool result

Keys while a part waits: `tab`/`↑↓` move, `←/→` change tabs/choices/sliders/select
cells, `enter` select or edit, `space` toggle, `esc` cancel. Herdr shows the pane as
blocked while it waits.

## Rendering (cells level)

Every component renders. Layout boxes, KPI tiles with trends, keyboard tabs and
accordions, steps, tables, editable tables, Braille area/line charts with
sparklines, stacked bars, share bars for pie/radial, forms with option cards,
chips, radio/select, switches, sliders and text inputs, follow-up lists. Colours
come only from Pi theme roles, so the `system` theme makes it follow the terminal
(tinty, Omarchy). Components without a dedicated layout use the profile's text
fallback.

Not yet: Kitty-graphics level (pixel charts and images in Ghostty, Kitty and Rex),
native surface protocols (Tern), live `Query`/`Mutation` data through the runner.

## Safety

- Outside the interactive TUI (print, JSON, RPC) a waiting part returns
  `unattended`: the extension never answers on the user's behalf.
- Non-`@Answer` actions (`@OpenUrl`, `@ToAssistant`, custom) are reported to the
  agent as events, never executed and never treated as answers.
- OpenUI telemetry: install scripts are blocked (bun's default for untrusted
  packages; with npm use `--ignore-scripts`), and the extension forces
  `OPENUI_TELEMETRY_DISABLED=1` and clears any runtime-telemetry opt-in.

## Tests

`bun test pi-openui`: every profile fixture renders within 40/72/120 columns,
tab switching, answers from buttons and state-bound forms, cancel, event
classification, per-session toggle and prompt injection, reload reconstruction,
no fabricated answers outside the TUI, invalid programs fail with a fix message.
`just test-prompts` also checks bounded guidance, reference paging and exclusion
of the profile's global assistant policy. The maintained `reference.ts` adapter
extracts only language-reference sections from the unchanged vendored profile;
unknown section boundaries fail closed and require review.

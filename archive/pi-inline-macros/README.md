# pi-inline-macros

Composable prompt macros using `::name` syntax.

## What it does

- Expands `::macroName` inline in user messages through the `input` event (`transform` result).
- Reuses Pi prompt templates discovered by Pi itself (via `pi.getCommands()` where `source="prompt"`).
- Works in TUI and RPC/SDK input flows.
- Supports positional args in template content:
  - `$1`, `$2`, ...
  - `$@` for all args

Example:

`Please ::review HEAD~3`

If `review.md` exists, its content is inserted and `$1` becomes `HEAD~3`.

## Commands

- `/macro` — list available macros
- `/macro <query ...>` — fuzzy-ish match and insert `::name` tokens
- `/m` — alias of `/macro`

## UI features

- Autocomplete for `::` prefix with descriptions/argument hints from frontmatter.
- Below-editor widget confirms detected macros in current input.

## Frontmatter hints

Supported frontmatter keys in prompt templates:

- `description`
- `argument-hint`
- `compact`

## Example templates

See `./examples/` for composition-friendly templates:
- `review.md`
- `test.md`
- `doc.md`
- `refactor.md`

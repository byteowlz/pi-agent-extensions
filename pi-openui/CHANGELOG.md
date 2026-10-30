# Changelog

## 3.1.0 (extension bundle)

- Replace the full profile injection with short instructions scoped to the
  `openui` tool's program argument. Normal conversation is not constrained by
  OpenUI output, fabricated-data or style directives.
- Add read-only `openui_reference` for bounded, paged syntax/component lookup.
  It and `openui` remain inactive until enabled for the session.
- Keep the generated vendor bundle unchanged; the maintained reference adapter
  excludes global assistant policy and rejects unknown reference boundaries.
- Cover prompt size/scope, disabled state, reference paging, preserved syntax
  and malformed profile boundaries with regression tests.

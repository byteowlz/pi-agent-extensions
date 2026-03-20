# read-file-guard

Guards against oversized text payloads from the `read` tool.

When a `read` result exceeds a configurable text size, this extension replaces the payload with a short note plus a small preview. This prevents provider-side request overflows (HTTP 413), model context bloat, and unstable long-running sessions.

## Why this exists

Large files (for example PDFs converted to long text by tools) can flood session history and crash later prompts.

## Configuration

Create `read-file-guard.json` in one of these locations (first match wins):

1. `<cwd>/read-file-guard.json`
2. `<cwd>/.pi/read-file-guard.json`
3. `~/.pi/agent/read-file-guard.json`

Example:

```json
{
  "enabled": true,
  "maxTextChars": 80000,
  "previewChars": 6000,
  "notify": true
}
```

## Fields

- `enabled` (boolean): Turn guard on/off.
- `maxTextChars` (number): Hard cap for total text content from a `read` tool result.
- `previewChars` (number): Number of initial characters preserved in the truncated preview.
- `notify` (boolean): Show warning toast in interactive UI when truncation happens.

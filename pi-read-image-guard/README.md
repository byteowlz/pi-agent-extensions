# read-image-guard

Guards against oversized inline image payloads from the `read` tool.

When a `read` tool result includes an image block whose base64 payload exceeds a configured size, this extension replaces that block with a short text note. This prevents provider-side request overflows (for example HTTP 413) and avoids poisoning long-running session history with huge image blobs.

## Why this exists

Large PNG files can still produce very large base64 payloads even after resizing. If those payloads stay in session context/history, later prompts can fail with request-body limits.

## Configuration

Create `read-image-guard.json` in one of these locations (first match wins):

1. `<cwd>/read-image-guard.json`
2. `<cwd>/.pi/read-image-guard.json`
3. `~/.pi/agent/read-image-guard.json`

Example:

```json
{
  "enabled": true,
  "maxImageBase64Bytes": 1200000,
  "maxWidth": 1200,
  "maxHeight": 1200,
  "jpegQuality": 70,
  "notify": true
}
```

## Fields

- `enabled` (boolean): Turn guard on/off.
- `maxImageBase64Bytes` (number): Hard cap for inline base64 size per image block.
- `maxWidth` (number): Max width used when downscaling oversized images.
- `maxHeight` (number): Max height used when downscaling oversized images.
- `jpegQuality` (number): JPEG quality used during recompression fallback.
- `notify` (boolean): Show warning toast in interactive UI when an image is resized or omitted.

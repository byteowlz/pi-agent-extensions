# pi-acpx

Pi extension that adds `AcpxDelegate` for delegating tasks to ACP-compatible coding agents through [`acpx`](https://github.com/openclaw/acpx).

## Tool

- `AcpxDelegate`
  - required: `agent`, `prompt`
  - optional: `session`, `cwd`, `mode` (`persistent`|`oneshot`), `timeoutSeconds`, `noWait`

## Example

```text
Use AcpxDelegate with:
{
  "agent": "claude",
  "prompt": "Refactor auth middleware and run tests",
  "mode": "persistent",
  "session": "auth"
}
```

## Requirements

- `acpx` available on PATH
- target ACP agent installed/authenticated as needed by acpx

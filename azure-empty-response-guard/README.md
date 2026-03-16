# Azure Empty Response Guard

Pi extension that detects and automatically retries silent empty responses from Azure Foundry model deployments.

## Problem

Azure Foundry (particularly Kimi K2.5, but also gpt-5-mini and others) can silently return empty streaming responses under concurrent load. Instead of a proper HTTP 429 or 503 error, Azure returns HTTP 200 with a valid-looking SSE stream containing only `prompt_filter_results` and `[DONE]` -- zero content blocks, zero usage tokens, `stopReason: "stop"`.

Pi's built-in retry mechanism only triggers on `stopReason: "error"`, so these empty responses are accepted as successful completions with no output.

This is a known Azure platform issue reported across multiple projects (LlamaIndex, Vercel AI SDK, CopilotKit, OpenCode, OpenAI Codex).

## How it works

1. Hooks into pi's `agent_end` event after each response completes
2. Inspects the last assistant message for the empty response signature:
   - `content: []` (zero content blocks)
   - `usage: { input: 0, output: 0 }` (zero tokens)
   - `stopReason: "stop"` (appears successful)
3. Immediately sends a retry message (configurable delay via `baseDelayMs`)
4. Gives up after `maxRetries` attempts and notifies the user
5. Resets the retry counter on any successful response or new user input

## Retry Modes

The extension supports three retry strategies via `retryMode`:

| Mode | Behavior |
|------|----------|
| `"continue"` | Always sends the `continueMessage` (default). The model already has the full conversation context and just needs a nudge to respond. |
| `"resend"` | Always re-sends the last user message verbatim. Risks duplicate tool calls if the model was mid-task. |
| `"auto"` | Uses `"resend"` when no tool calls have happened yet (first turn), switches to `"continue"` once tool results exist in the session. |

### Continue Message

The `continueMessage` defaults to `"continue"`. This sends a short user message that nudges the model to pick up from context. Must be non-empty -- some providers (e.g. Kimi K2.5 on Azure) reject empty string content with a 422 error. Alternatives:

- `"continue"` -- minimal nudge (default)
- `"please continue where you left off"` -- more explicit
- `"Your last response was empty due to a server error. Please continue."` -- verbose but informative

## Installation

### Symlink (recommended for development)

```bash
ln -s ~/byteowlz/pi-agent-extensions/azure-empty-response-guard ~/.pi/agent/extensions/azure-empty-response-guard
```

### Copy

```bash
cp -r azure-empty-response-guard ~/.pi/agent/extensions/
```

Then restart pi or run `/reload`.

## Configuration

Place `azure-empty-response-guard.json` in your working directory, `.pi/`, or `~/.pi/agent/`:

```json
{
  "enabled": true,
  "maxRetries": 5,
  "baseDelayMs": 0,
  "retryMode": "continue",
  "continueMessage": "continue",
  "debug": false,
  "providers": ["Foundry_WG"]
}
```

| Field | Default | Description |
|-------|---------|-------------|
| `enabled` | `true` | Enable/disable the guard |
| `maxRetries` | `5` | Max consecutive retry attempts before giving up |
| `baseDelayMs` | `0` | Delay in ms before first retry (doubles each attempt). 0 = immediate |
| `retryMode` | `"continue"` | Retry strategy: `"continue"`, `"resend"`, or `"auto"` |
| `continueMessage` | `"continue"` | Message sent in continue mode. Must be non-empty |
| `debug` | `false` | Show detailed debug notifications with response metadata |
| `providers` | `[]` | Provider names to monitor. Empty array means all providers |

## Commands

| Command | Description |
|---------|-------------|
| `/azure-guard` | Show current status and configuration |
| `/azure-guard status` | Same as above |
| `/azure-guard reset` | Reset the retry counter manually |

## Limitations

- Cannot prevent the empty response from appearing in the session history (it has already been saved by the time the extension sees it)
- If Azure is persistently throttling the deployment, all retries will fail and the user needs to wait manually
- Only detects the specific "zero content + zero tokens + stop" pattern. Other Azure failure modes (timeouts, 422 errors) are handled by pi's built-in retry

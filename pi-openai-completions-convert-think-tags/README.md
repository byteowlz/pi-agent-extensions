# openai-completions-convert-think-tags

A [pi](https://github.com/badlogic/pi-mono) extension that parses `<think>...</think>` and `<thinking>...</thinking>` XML tags from model responses and converts them into native thinking blocks.

## Problem

Many models (MiniMax, DeepSeek, GLM, Qwen, etc.) emit reasoning content wrapped in `<think>` tags inside the regular response content when served via OpenAI-compatible endpoints (vLLM, SGLang, etc.). Pi's built-in `openai-completions` handler only recognizes reasoning from the `reasoning_content` / `reasoning` / `reasoning_text` fields in the streaming delta, so the XML tags show up as raw text in the output.

## Solution

This extension wraps the stream for configured providers with a real-time state machine that:

1. Intercepts text deltas as they stream in
2. Detects `<think>` / `</think>` (or `<thinking>` / `</thinking>`) tag boundaries
3. Converts tagged content into proper `thinking_start` / `thinking_delta` / `thinking_end` events
4. Handles tags split across multiple streaming chunks
5. Passes through tool calls and native `reasoning_content` thinking untouched

## Setup

### 1. Configure providers

Edit the `THINK_TAG_PROVIDERS` set in `index.ts` to include your provider names:

```typescript
const THINK_TAG_PROVIDERS = new Set([
  "fhgenie-preview",
  "my-other-provider",
]);
```

### 2. Model configuration

In `~/.pi/agent/models.json`, set your provider to this custom API name:

```json
{
  "providers": {
    "your-provider": {
      "api": "openai-completions-convert-think-tags"
    }
  }
}
```

Model entries should keep `reasoning: true` if you want thinking enabled.

### 3. Install

Copy or symlink to the pi extensions directory:

```bash
# Copy
cp -r ~/byteowlz/pi-agent-extensions/openai-completions-convert-think-tags ~/.pi/agent/extensions/openai-completions-convert-think-tags

# Or symlink
ln -s ~/byteowlz/pi-agent-extensions/openai-completions-convert-think-tags ~/.pi/agent/extensions/openai-completions-convert-think-tags
```

Then `/reload` in pi or restart.

## How it works

The extension registers a custom `streamSimple` for each configured provider. This wraps the built-in OpenAI completions stream with a streaming state machine:

```
Upstream (openai-completions)          Extension (think-tag parser)
                                  
text_delta: "<thi"           -->  MaybeTag: buffer "<thi"
text_delta: "nk>"            -->  Match! -> thinking_start
text_delta: "reasoning..."   -->  thinking_delta: "reasoning..."
text_delta: "</thi"          -->  MaybeTag: buffer "</thi"
text_delta: "nk>"            -->  Match! -> thinking_end
text_delta: "Final answer"   -->  text_start + text_delta: "Final answer"
```

The state machine has three states:

- **Text** -- normal content, forwarded as text events
- **Thinking** -- inside a think block, forwarded as thinking events
- **MaybeTag** -- buffering characters that could be an opening or closing tag

## Supported tags

- `<think>...</think>`
- `<thinking>...</thinking>`

## Limitations

- Only works with `openai-completions` API providers
- The provider names must be hardcoded in the extension (no runtime configuration yet)
- Native `reasoning_content` thinking from the model is passed through but content index mapping may be off if both mechanisms are used simultaneously

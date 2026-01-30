# Auto-Rename Extension for pi

Automatically generates descriptive session names based on the first user query, making it easier to find and resume sessions later.

## Features

- **Automatic naming**: Generates a session name after the first assistant response
- **Configurable model**: Use any model accessible via pi (Anthropic, OpenAI, Google, etc.)
- **Fallback model**: Specify an alternative model if the primary fails
- **Deterministic fallback**: Generate names without LLM if all models fail
- **Custom prompts**: Customize the prompt used for name generation
- **Static or dynamic prefixes**: Use a fixed string or a shell command for the prefix
- **Readable-id suffix**: Append a deterministic `[adjective-noun-noun]` id
- **Prefix-only mode**: Skip LLM entirely and use just the prefix (e.g., workspace name)
- **Manual override**: Rename sessions manually via `/auto-rename <name>`
- **Regenerate names**: Force regeneration with `/auto-rename regen`
- **Connectivity test**: Test model availability with `/auto-rename test`

## Installation

Copy or symlink the `auto-rename` directory to your pi extensions folder:

```bash
# Global installation
cp -r auto-rename ~/.pi/agent/extensions/

# Or project-local
cp -r auto-rename .pi/extensions/
```

Then reload pi or restart it.

## Configuration

Create `auto-rename.json` in one of these locations (searched in order):

1. `./auto-rename.json` (current working directory)
2. `./.pi/auto-rename.json` (project-local)
3. `~/.pi/agent/auto-rename.json` (global)

### Default Configuration

```json
{
  "$schema": "./auto-rename.schema.json",
  "model": {
    "provider": "anthropic",
    "id": "claude-3-5-haiku-20241022"
  },
  "fallbackModel": {
    "provider": "openai",
    "id": "gpt-4o-mini"
  },
  "fallbackDeterministic": "readable-id",
  "prompt": "Generate a short, descriptive title...",
  "prefix": "",
  "prefixCommand": null,
  "prefixOnly": false,
  "readableIdSuffix": false,
  "enabled": true,
  "debug": false
}
```

### Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `model.provider` | string | `"anthropic"` | Primary LLM provider |
| `model.id` | string | `"claude-3-5-haiku-20241022"` | Primary model ID |
| `fallbackModel` | object/null | `{"provider":"openai","id":"gpt-4o-mini"}` | Fallback model if primary fails. Set to `null` to disable. |
| `fallbackDeterministic` | string | `"readable-id"` | Fallback if all LLMs fail: `"readable-id"` (adjective-noun-noun from session ID), `"truncate"` (first 50 chars), `"words"` (first 6 words), `"none"` |
| `prompt` | string | (see above) | Prompt template. Use `{{query}}` as placeholder |
| `prefix` | string | `""` | Static prefix before generated names |
| `prefixCommand` | string/null | `null` | Shell command to generate dynamic prefix (5s timeout) |
| `prefixOnly` | boolean | `false` | Skip LLM, use only prefix as full name |
| `readableIdSuffix` | boolean | `false` | Append `[readable-id]` to generated names |
| `enabled` | boolean | `true` | Enable/disable auto-rename |
| `debug` | boolean | `false` | Show debug notifications |
| `wordlistPath` | string/null | `null` | Override path to `word_lists.toml` (relative to session cwd) |
| `wordlist` | object | `null` | Inline wordlist override (`{ adjectives: [], nouns: [] }`) |

### Example Configurations

**Using OpenAI with Google fallback:**
```json
{
  "model": { "provider": "openai", "id": "gpt-4o-mini" },
  "fallbackModel": { "provider": "google", "id": "gemini-2.0-flash" }
}
```

**Local Ollama with cloud fallback:**
```json
{
  "model": { "provider": "ollama", "id": "llama3.2" },
  "fallbackModel": { "provider": "anthropic", "id": "claude-3-5-haiku-20241022" },
  "fallbackDeterministic": "words"
}
```

**No LLM fallback, deterministic only on failure:**
```json
{
  "model": { "provider": "anthropic", "id": "claude-3-5-haiku-20241022" },
  "fallbackModel": null,
  "fallbackDeterministic": "readable-id"
}
```

**Dynamic prefix from git repo name:**
```json
{
  "prefixCommand": "basename $(git rev-parse --show-toplevel 2>/dev/null || pwd)"
}
```
Result: `my-project: Fix Authentication Bug`

**Workspace prefix + readable-id suffix:**
```json
{
  "prefixCommand": "basename $(git rev-parse --show-toplevel 2>/dev/null || pwd)",
  "readableIdSuffix": true
}
```
Result: `my-project: Fix Authentication Bug [brisk-sunflower-river]`

**Workspace name only (no LLM):**
```json
{
  "prefixCommand": "basename $(git rev-parse --show-toplevel 2>/dev/null || pwd)",
  "prefixOnly": true
}
```

**Custom wordlist path for readable IDs:**
```json
{
  "fallbackDeterministic": "readable-id",
  "wordlistPath": "./word_lists.toml"
}
```
Result: `my-project`

**Git branch as prefix:**
```json
{
  "prefixCommand": "git branch --show-current 2>/dev/null || echo 'main'"
}
```
Result: `feature/auth: Add OAuth Support`

**Custom prompt for code-focused sessions:**
```json
{
  "prompt": "Generate a 3-5 word title for a coding session. Focus on the programming language, framework, or task. Based on:\n\n{{query}}\n\nReply with ONLY the title.",
  "prefix": "code: "
}
```

## Commands

| Command | Description |
|---------|-------------|
| `/auto-rename` | Show current session name |
| `/auto-rename <name>` | Manually set session name |
| `/auto-rename regen` | Force regenerate name from first query |
| `/auto-rename config` | Show current configuration |
| `/auto-rename init` | Create default config in current directory |
| `/auto-rename test` | Test model connectivity |

## How It Works

1. On `session_start`, the extension checks if the session already has a name
2. After the first `agent_end` event (first assistant response), it:
   - Resolves the prefix (runs `prefixCommand` if set, otherwise uses static `prefix`)
   - If `prefixOnly` is true: uses just the prefix as the session name
   - Otherwise: extracts the first user message and tries to generate a name:
     1. Try primary model
     2. If primary fails, try fallback model
     3. If both fail, use deterministic fallback (`readable-id`, `truncate`, `words`, or `none`)
   - Combines prefix + generated name and sets via `pi.setSessionName()`
3. The name appears in the session selector (`/resume`) instead of the first message

### Error Handling

The extension provides detailed error messages for common issues:

- **Provider not found**: Shows available providers
- **Model not found**: Indicates the model ID is invalid
- **No API key**: Reminds you to set the environment variable
- **Authentication failed (401/403)**: API key is invalid or expired
- **Rate limited (429)**: Too many requests, uses fallback
- **Timeout**: Network issues, uses fallback

Enable `debug: true` to see all error details.

### Fallback Chain

```
Primary Model → Fallback Model → Deterministic Function → (no name)
     ↓               ↓                    ↓
  Success?       Success?            "truncate" / "words"
     ↓               ↓                    ↓
   Done!          Done!               Done! (or skip if "none")
```

## Session File Format

The extension writes to the standard pi session format using `pi.setSessionName()`, which appends a `session_info` entry to the JSONL session file:

```json
{"type":"session_info","id":"...","parentId":"...","timestamp":"...","name":"Your Generated Name"}
```

This is the canonical field for session names in pi-agent session files.

## Requirements

- pi-coding-agent (pi)
- An API key for at least one configured model provider (or use `prefixOnly`)
- Node.js 18+

## Tips

- Use a fast, cheap model (like `claude-3-5-haiku` or `gpt-4o-mini`) for quick naming
- Set up a fallback model from a different provider for reliability
- Use `fallbackDeterministic: "readable-id"` for canonical session IDs
- Keep the prefix short to avoid truncation in the session selector
- Enable `debug: true` temporarily to troubleshoot issues
- Use `/auto-rename test` to verify model connectivity before relying on it
- The extension skips renaming if the session already has a name

## Files

- `index.ts` - Extension source code
- `auto-rename.schema.json` - JSON Schema (Draft-07) for configuration validation
- `auto-rename.example.json` - Example configuration file
- `README.md` - This documentation

## License

MIT

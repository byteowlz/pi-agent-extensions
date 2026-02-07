# pi-agent-extensions

Custom extensions for the [pi coding agent](https://github.com/badlogic/pi-mono).

## Project Structure

```
pi-agent-extensions/
├── AGENTS.md              # This file
├── README.md              # User documentation
├── package.json           # Dependencies and scripts
├── tsconfig.json          # TypeScript config
├── biome.json             # Linter/formatter config
└── <extension-name>/      # Each extension in its own directory
    ├── index.ts           # Extension entry point
    ├── README.md          # Extension documentation
    ├── *.schema.json      # JSON Schema for config (optional)
    └── *.example.json     # Example config (optional)
```

## Commands

```bash
bun run check      # Run lint + typecheck (required before committing)
bun run lint       # Biome linting only
bun run lint:fix   # Auto-fix lint issues
bun run typecheck  # tsgo type checking
```

## Creating Extensions

### Extension Entry Point

Every extension must export a default function that receives `ExtensionAPI`:

```typescript
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  // Subscribe to events
  pi.on("session_start", async (_event, ctx) => { });
  pi.on("agent_end", async (_event, ctx) => { });

  // Register commands
  pi.registerCommand("my-cmd", {
    description: "Do something",
    handler: async (args, ctx) => { },
  });
}
```

### Tool Naming Convention (CRITICAL for OAuth)

**All custom tools MUST use PascalCase naming** to comply with Anthropic's Claude Code OAuth validation:

```typescript
// ✅ CORRECT - PascalCase (OAuth compatible)
pi.registerTool({
  name: "MyTool",           // ✅ PascalCase
  name: "TodoWrite",        // ✅ PascalCase
  name: "DelegateStatus",   // ✅ PascalCase
});

// ❌ WRONG - Will cause OAuth authentication failures
pi.registerTool({
  name: "my_tool",          // ❌ snake_case - OAuth FAILS
  name: "mytool",           // ❌ lowercase - OAuth FAILS
  name: "myTool",           // ❌ camelCase - OAuth FAILS
});
```

**Why:** Anthropic's OAuth validation enforces strict tool naming that matches Claude Code's built-in tools (`Read`, `Write`, `Bash`, `Edit`, etc.). Non-PascalCase tool names will cause "not allowed by anthropic" errors during OAuth authentication.

**Built-in tool reference:** `Read`, `Write`, `Bash`, `Edit`, `Grep`, `Find`, `Ls`

See `OAUTH-FIX.md` for technical details and the GitHub PR that identified this requirement.

### Using LLM APIs

Use `@mariozechner/pi-ai` for LLM calls and `ctx.modelRegistry` for API keys:

```typescript
import { complete, getModel } from "@mariozechner/pi-ai";

const model = getModel("anthropic", "claude-3-5-haiku-20241022");
const apiKey = await ctx.modelRegistry.getApiKey(model);

const response = await complete(model, {
  messages: [{ role: "user", content: [{ type: "text", text: prompt }], timestamp: Date.now() }],
}, { apiKey });
```

### Configuration Files

Extensions can load config from (searched in order, first match wins):

1. `./<config>.json` (cwd)
2. `./.pi/<config>.json` (project-local)
3. `~/.pi/agent/<config>.json` (global)

Always provide:

- Default config values
- JSON Schema for validation
- Example config file

## Code Quality

### Required Before Commit

- Run `npm run check` - must pass with no errors
- No `any` types unless absolutely necessary
- Use `ctx.modelRegistry.getApiKey()` for API keys (respects pi's auth)
- Handle errors gracefully with user-friendly messages

### Linting Rules

Key rules enforced by Biome:

- `noUnusedVariables`, `noUnusedImports`: error
- `noExcessiveCognitiveComplexity`: warn (max 25) - refactor complex functions
- `useConst`: error - prefer const over let
- `noExplicitAny`: warn - avoid any types
- `noDoubleEquals`: error - use === not ==

### Complexity Guidelines

Keep functions under complexity 25 by:

- Extracting helper functions
- Using early returns
- Avoiding deep nesting
- Separating concerns (parsing, validation, execution)

## Dependencies

- `@mariozechner/pi-coding-agent` - Extension API types and utilities
- `@mariozechner/pi-ai` - LLM API (complete, stream, getModel, etc.)
- `@biomejs/biome` - Linting and formatting
- `@rslint/tsgo` - Fast TypeScript type checking

## Documentation

- [pi extension docs](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/extensions.md)
- [pi-ai README](https://github.com/badlogic/pi-mono/blob/main/packages/ai/README.md)
- [pi session format](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/session.md)

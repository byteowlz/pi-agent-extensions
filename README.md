# pi-agent-extensions

Custom extensions for the [pi coding agent](https://github.com/badlogic/pi-mono).

## Extensions

| Extension | Description |
|-----------|-------------|
| [auto-rename](./auto-rename/) | Automatically generate session names based on first user query |
| [crosstalk](./crosstalk/) | Inter-session control socket and messaging (adapted from Armin Ronacher) |
| [octo-todos](./octo-todos/) | Todo management tools for Octo frontend integration (drop-in replacement for OpenCode todowrite/todoread) |
| [delegate](./delegate/) | Delegate tasks to Pi subagents (parallel + async), with Octo child-session integration |

## Development

### Prerequisites

- Node.js 18+
- npm

### Setup

```bash
npm install
```

### Commands

| Command | Description |
|---------|-------------|
| `npm run check` | Run lint + typecheck |
| `npm run lint` | Biome linting only |
| `npm run lint:fix` | Auto-fix lint issues |
| `npm run typecheck` | tsgo type checking |

### Linting Rules

This repo uses [Biome](https://biomejs.dev/) with strict rules:

**Correctness:**
- `noUnusedVariables`: error - Catch dead code
- `noUnusedImports`: error - Keep imports clean

**Complexity:**
- `noExcessiveCognitiveComplexity`: warn (max 25) - Flag overly complex functions

**Style:**
- `noNonNullAssertion`: warn - Discourage `!` assertions
- `useConst`: error - Prefer `const` over `let`
- `useTemplate`: error - Prefer template literals over concatenation
- `noUnusedTemplateLiteral`: error - Don't use backticks for plain strings
- `noParameterAssign`: error - Don't reassign parameters
- `useDefaultParameterLast`: error - Default params at end
- `useShorthandArrayType`: error - Use `T[]` not `Array<T>`
- `useSingleVarDeclarator`: error - One variable per declaration

**Suspicious:**
- `noExplicitAny`: warn - Discourage `any` type
- `noConfusingVoidType`: error - Avoid confusing void usage
- `noDoubleEquals`: error - Use `===` not `==`
- `noEmptyBlockStatements`: warn - Flag empty blocks
- `noImplicitAnyLet`: error - Require types for `let`
- `noShadowRestrictedNames`: error - Don't shadow globals

**Performance:**
- `noAccumulatingSpread`: warn - Avoid spread in loops
- `noDelete`: warn - Prefer `undefined` over `delete`

**Security:**
- `noDangerouslySetInnerHtml`: error - Prevent XSS vectors

### Type Checking

Uses [tsgo](https://github.com/ArnaudBarre/tsgo) for fast TypeScript checking with strict settings.

## Creating a New Extension

1. Create a new directory: `mkdir my-extension`
2. Add `index.ts` with the extension code
3. Optionally add:
   - `README.md` - Documentation
   - `*.schema.json` - JSON Schema for config validation
   - `*.example.json` - Example configuration

See the [pi extension documentation](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/extensions.md) for the full API.

### Extension Template

```typescript
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  // Subscribe to events
  pi.on("session_start", async (_event, ctx) => {
    if (ctx.hasUI) {
      ctx.ui.notify("Extension loaded!", "info");
    }
  });

  // Register commands
  pi.registerCommand("my-command", {
    description: "Do something",
    handler: async (args, ctx) => {
      ctx.ui.notify(`Args: ${args}`, "info");
    },
  });
}
```

## Installation

To use these extensions with pi:

```bash
# Global installation (all projects)
cp -r <extension-name> ~/.pi/agent/extensions/

# Or project-local
cp -r <extension-name> .pi/extensions/

# Or symlink for development
ln -s $(pwd)/<extension-name> ~/.pi/agent/extensions/<extension-name>
```

## License

MIT

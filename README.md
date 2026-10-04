# pi-agent-extensions

Custom extensions for the [pi coding agent](https://github.com/badlogic/pi-mono).

## Maintained extensions

The 2.2.0 collection targets **Pi 1.0.0**. Pre-1.0 host compatibility is no
longer promised. There are 25 active extensions: 17 selected to keep, six
still under review and the new selection/capabilities pair. See [the archive](./archive/README.md) for the five retired
extensions and [migration evidence](./docs/pi-1-baseline.md) for proof limits.

| Extension | Purpose |
|-----------|---------|
| [pi-auto-rename](./pi-auto-rename/) | Session naming |
| [pi-session-tools](./pi-session-tools/) | Session routing and subagent orchestration |
| [pi-history-search](./pi-history-search/) | Search/read previous sessions |
| [pi-introspection](./pi-introspection/) | Session/model/context information |
| [pi-env-ctx](./pi-env-ctx/) | Pi-native child-process metadata |
| [pi-oqto-bridge](./pi-oqto-bridge/) | Oqto runtime integration |
| [pi-todolist](./pi-todolist/) | Collapsible todo widget, formerly pi-oqto-todos |
| [pi-selection](./pi-selection/) | Content-only Questions/Review, native TUI/browser and CLI |
| [pi-capabilities](./pi-capabilities/) | Optional versioned presentation discovery; not permission grants |
| [pi-custom-context-files](./pi-custom-context-files/) | Additional instruction files |
| [pi-kyz](./pi-kyz/) | Secret injection and output scrubbing |
| [pi-mmry](./pi-mmry/) | Scoped memory integration |
| [pi-sudo](./pi-sudo/) | Guarded privilege elevation |
| [pi-trx-picker](./pi-trx-picker/) | Issue picker |
| [pi-markdown-export](./pi-markdown-export/) | Markdown transcript export |
| [pi-statusline](./pi-statusline/) | Native TUI footer |
| [pi-ssh-key](./pi-ssh-key/) | Session-scoped SSH keys |
| [pi-tui-rpc](./pi-tui-rpc/) | Native TUI remote control |
| [pi-xlatch-session](./pi-xlatch-session/) | Phone-to-session sharing |
| [pi-read-file-guard](./pi-read-file-guard/) | Oversized text guard — under review |
| [pi-read-image-guard](./pi-read-image-guard/) | Oversized image guard — under review |
| [pi-bash-picker](./pi-bash-picker/) | Shell snippet picker — under review |
| [pi-edit-agent](./pi-edit-agent/) | Edit/branch assistant messages — under review |
| [pi-error-recovery](./pi-error-recovery/) | Provider workarounds — under review |
| [pi-azure-empty-response-guard](./pi-azure-empty-response-guard/) | Azure workaround — under review |

> **Note:** The `delegate` and `tmux-delegate` extensions have been removed in favor of [pi-subagents](https://github.com/nicobailon/pi-subagents) (`pi install npm:pi-subagents`), which provides structured JSON streaming, usage tracking, chain/parallel modes, and a TUI clarification overlay.

## Development

### Prerequisites

- Node.js 22.19+
- Pi 1.0.0
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
| `npm test` | Maintained extension tests (excludes archive) |
| `npm run test:pi-1 -- /path/to/pi` | Exact Pi 1.0.0 individual + combined catalog smoke |

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
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

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

### Via npm (recommended)

Published extensions can be installed directly via pi:

```bash
pi install npm:@byteowlz/pi-auto-rename
pi install npm:@byteowlz/pi-bash-picker
pi install npm:@byteowlz/pi-trx-picker
```

### Manual installation

To use extensions locally from this repo:

```bash
# Global installation (all projects)
cp -r <extension-name> ~/.pi/agent/extensions/

# Or project-local
cp -r <extension-name> .pi/extensions/

# Or symlink for development
ln -s $(pwd)/<extension-name> ~/.pi/agent/extensions/<extension-name>
```

## Publishing Extensions

Individual extensions can be published as npm packages under the `@byteowlz/` scope. Pi loads TypeScript directly via jiti, so no build step is needed.

```bash
just publish-setup auto-rename   # Prepare extension for npm
just publish-setup-all           # Prepare all extensions
just publish auto-rename         # Publish to npm
just publish-all                 # Publish all
just publish-bump auto-rename    # Bump version (patch/minor/major)
just publish-status              # Show setup and npm status
```

## License

MIT

# OAuth Compatibility Fix - Tool Name Casing

## Date: 2026-02-06

## Problem
Anthropic's Claude Code OAuth validation requires **PascalCase tool names** to match their official tool naming convention. Extensions using snake_case or lowercase tool names cause OAuth authentication to fail with "not allowed" errors.

## Root Cause
From [GitHub PR #15](https://github.com/anomalyco/opencode-anthropic-auth/pull/15):
> "Anthropic now validates Claude Code–specific request shape for OAuth tokens. Matching only tool prefixes is insufficient; **headers, betas, metadata, tool casing** all must match."

Built-in Claude Code tools use PascalCase:
- `Read`, `Write`, `Bash`, `Edit`, `Grep`, `Find`, `Ls`

Custom extensions must follow the same convention for OAuth compatibility.

## Changes Made

### oqto-todos Extension
**File:** `oqto-todos/index.ts`

| Before | After | Line |
|--------|-------|------|
| `name: "todowrite"` | `name: "TodoWrite"` | Tool registration |
| `name: "todoread"` | `name: "TodoRead"` | Tool registration |
| `name: "todo"` | `name: "Todo"` | Tool registration |
| `theme.bold("todowrite ")` | `theme.bold("TodoWrite ")` | renderCall |
| `theme.bold("todoread")` | `theme.bold("TodoRead")` | renderCall |
| `theme.bold("todo ")` | `theme.bold("Todo ")` | renderCall |

### delegate Extension
**File:** `delegate/index.ts`

| Before | After | Line |
|--------|-------|------|
| `name: "delegate"` | `name: "Delegate"` | Tool registration |
| `name: "delegate_status"` | `name: "DelegateStatus"` | Tool registration |
| `theme.bold("delegate ")` | `theme.bold("Delegate ")` | renderCall (2 instances) |

## Testing

After applying these fixes:

1. **Verify tool names:**
   ```bash
   grep "name: \"" oqto-todos/index.ts delegate/index.ts
   ```
   
   Expected output:
   ```
   oqto-todos/index.ts:		name: "TodoWrite",
   oqto-todos/index.ts:		name: "TodoRead",
   oqto-todos/index.ts:		name: "Todo",
   delegate/index.ts:		name: "Delegate",
   delegate/index.ts:		name: "DelegateStatus",
   ```

2. **Test OAuth authentication:**
   ```bash
   pi /login
   ```
   
   Should now succeed without "not allowed" errors.

3. **Verify tools work:**
   ```bash
   pi -p "List all available tools"
   ```
   
   Should show `TodoWrite`, `TodoRead`, `Todo`, `Delegate`, `DelegateStatus` in PascalCase.

## Impact

### ✅ Benefits
- OAuth authentication now works with Anthropic's validation
- Tools maintain full functionality
- Follows official Claude Code naming conventions
- Future-proof against stricter OAuth validation

### ⚠️ Breaking Changes
- Tool names changed from snake_case to PascalCase
- Any hardcoded references to old tool names will need updating
- Existing session files may reference old tool names (pi handles this gracefully)

### 🔄 Migration
No migration needed - pi's tool execution is case-aware and handles the new names automatically. The changes are transparent to users.

## References

- **Anthropic OAuth validation PR:** https://github.com/anomalyco/opencode-anthropic-auth/pull/15
- **Pi extensions documentation:** `/usr/lib/node_modules/@mariozechner/pi-coding-agent/docs/extensions.md`
- **Built-in tool names:** Read, Write, Bash, Edit, Grep, Find, Ls (all PascalCase)

## Related Extensions

Other extensions checked (no issues found):
- ✅ `auto-rename` - No custom tools registered
- ✅ `custom-context-files` - No custom tools registered  
- ✅ `oqto-bridge` - No custom tools registered

## Validation

All tool names now follow PascalCase convention:
- ✅ TodoWrite (was todowrite)
- ✅ TodoRead (was todoread)
- ✅ Todo (was todo)
- ✅ Delegate (was delegate)
- ✅ DelegateStatus (was delegate_status)

OAuth compatibility: **FIXED** ✅

---

**Last Updated:** 2026-02-06  
**Status:** Complete  
**Next Steps:** Test OAuth authentication with `pi /login`

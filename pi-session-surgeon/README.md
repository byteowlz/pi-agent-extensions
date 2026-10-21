# session-surgeon

Agentically rewrite this session's history in a **sandboxed copy**, from a
natural-language prompt:

```
/surgeon remove any mention of the movies Pulp Fiction and Reservoir Dogs
/surgeon --model anthropic/claude-sonnet-4 summarize every tool output
/surgeon --timeout 900 strip credentials from assistant messages
```

The original session is never modified. You review the diff before a new branch
is created.

## How it works

1. **Stage** — a private temp root (0700) with one workspace:
   ```
   /tmp/pi-surgeon-<id>/
     policy.toml            0600, outside the grant
     work/                  the ONLY --workspace grant
       session.jsonl        0600 copy the surgeon may change
       agent/               private PI_CODING_AGENT_DIR (models/auth copied)
       sessions/            the surgeon's own session dir
       home/                HOME
       ext/                 copied extension the child loads
   ```
2. **Prove the policy** — `oqto-sandbox` is invoked with a
   **restriction-only overlay** (ADR 0070): `deny_read`/`deny_write` for
   `~/.pi`, `~/.ssh`, `~/.aws`, `~/.gnupg`, `~/.config/gh`, `~/.kube`, and
   `home_access = "none"`. No `--config`, no profile replacement, no grants.
   On Linux the extension reads `--print-effective --json` and refuses to launch
   unless the workspace is the only writable grant and `~/.pi` is denied.
   On macOS there is no effective report yet, so it compiles with `--dry-run`
   and says so.
3. **Run** — a dedicated Pi agent inside the sandbox, with only
   `session_surgery`, `read` and `grep`. The child gets the real model
   credentials (it must call the provider) but cannot reach the rest of your
   agent state: other sessions, extensions, memory.
4. **Verify + review** — the JSONL is re-parsed and structurally checked
   (unique ids, resolvable parents). You see the changed messages before
   anything is applied.
5. **Publish** — a new branch is created in the real session directory and
   switched to; the original file stays untouched.

## The surgery tool

The agent never hand-edits JSONL. It calls `session_surgery`:

| action | effect |
|---|---|
| `list` | message ids, roles, editability, previews |
| `show` | one full message text |
| `replace` | rewrite **text only**, preserving id, parentId, timestamp and block shape |
| `verify` | structural check |

Mixed or multi-block content (tool calls, results, thinking, images) is refused,
so a rewrite can never drop tool history. Writes are atomic (temp + fsync +
rename) with a one-time `.bak`.

## Requirements

- `oqto-sandbox` on `PATH` with the `--overlay` / `--print-effective` support
  from ADR 0070. Without it the command fails closed and runs nothing.
- Linux: bwrap backend (effective-policy reporting). macOS: Seatbelt, dry-run
  verification only for now.
- No Docker fallback in v1 — ADR 0070 does not cover Docker placement.

## Limits

- Text-only rewrites. Removing a message entirely or editing tool results is out
  of scope.
- The surgeon reads the session content, so anything in the transcript reaches
  the model provider. Credentials in the transcript are a prompt-injection
  target; the sandbox limits what it can *do*, not what it can *say*.
- Subagent sandboxing is **not** enabled here: it needs the trusted supervisor
  binding from `oqto-v8n2.1`, not a TS-side check.

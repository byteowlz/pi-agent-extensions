# pi-history-search

Lets a pi agent **search its own session history** efficiently, via a SQLite
FTS5 index and literal scans. `HistorySearch`, `HistoryRead`, `HistoryGrep`, and
`HistoryBranches` let the
agent can recall earlier decisions, prior solutions, file paths, error messages,
or what was already tried, instead of re-deriving them.

Designed to integrate cleanly with [oqto](https://github.com/byteowlz/oqto) and
to work just as well with plain pi. No external LLM / OpenRouter dependency.

## Tools

### `HistorySearch`

Evidence-first recall: identifiers use literal → regex (when shaped) → FTS;
natural-language queries use FTS candidates with all-role evidence selection.

| Param | Type | Notes |
|---|---|---|
| `query` | string (optional) | Search terms. **Omit/empty → most recent sessions** (for "what did we do here/recently"). |
| `scope` | `"project"` \| `"all"` \| `"current-tree"` \| `"current-branch"` \| `"siblings"` \| `"ancestors"` \| `"descendants"` | Default `"project"`. `"all"` searches other projects. Branch-aware scopes limit to the current session graph. |
| `project` | string | With `scope:"all"`, keep only sessions whose project label contains this. |
| `roleFilter` | `all` \| `conversation` \| `user` \| `assistant` \| `tool` | Default `conversation` prefers conversational prose but still selects tool evidence. `user`, `assistant`, and `tool` are strict evidence filters. |
| `limit` | number | Max sessions (default from config). |
| `mode` | `auto` \| `grep` \| `exact` \| `regex` \| `fts` | Default `auto`; `grep` forces literal-first routing. `exact` is case-sensitive literal-only; `regex` forces a JS regex. |
| `maxTotalChars` | integer | Serialized JSON budget, default 3000 (1000–60000). |
| `verbose` | boolean | Include branch metadata within the same budget. |

Returns a JSON envelope with `attempts`, `truncated`, filters, limitations, and
`hits`. Each hit has a title, timestamp, `sessionId`, and one ≤300-character
snippet with `role`, `msgIndex`, and `matchPosition`. Expand in one call:
`HistoryRead{sessionId, around: msgIndex, matchPosition}`. Positions are UTF-16
character offsets in extracted message text; message ordinals are not JSONL lines.

FTS considers up to 20 candidate sessions per project and 192 passage positions
per message. Exact/grep bypass stale indexes. Completeness is always `unknown`:
accessible files may be copies, malformed records are skipped, and missing hits
are never global proof of absence. Search covers stored message text blocks,
not images, thinking blocks, or tool-call arguments. All-project searches remain
local to accessible files; no remote-source discovery is implied.

> **The current (live) session is excluded by default** — it's already in the
> agent's context, so returning it is noise. Disable with `excludeCurrentSession`
> in config. The explicit `current-branch` scope is the one exception (it would
> otherwise always be empty).

### `HistoryBranches`

List branches in the current session tree (or full project) with mechanical metadata only.

| Param | Type | Notes |
|---|---|---|
| `scope` | `"current-tree"` \| `"project"` | Default `"current-tree"`. |
| `grep` | string | Optional text filter over ids/aliases/previews/files/commands. |
| `limit` | number | Max branches returned (default 50). |

### `HistoryGrep`

**Surgical, exact search inside ONE session.** Reads a single session file once
and runs one literal/regex pass over its messages — no FTS index, no
tokenization — so it's fast even for large older sessions and catches the exact
strings that tokenized `HistorySearch` misses: code identifiers, camelCase
names, stack traces, error strings, file paths.

Typical flow: `HistorySearch` finds the session, then `HistoryGrep` extracts the
exact lines (each returned with a pinpoint `msgIndex`).

| Param | Type | Notes |
|---|---|---|
| `sessionId` / `branchId` | string | The session to search inside (from a `HistorySearch` result). |
| `pattern` | string | Substring or regular expression to search for. |
| `regex` | boolean | Treat `pattern` as a JS regular expression. Default `false` (literal substring). |
| `fallback` | boolean | Retry regex-shaped literal misses as regex; default `true`. Disable for literal-only behavior. |
| `maxTotalChars` | integer | Total serialized output budget, default 3000. |
| `ignoreCase` | boolean | Case-insensitive match. Default `true`. |
| `roleFilter` | `all` \| `conversation` \| `user` \| `assistant` \| `tool` | Restrict which roles are scanned. Default `all`. |
| `before` / `after` | number | Include this many full messages around each match for context. Default `0` (surgical: matches only). |
| `maxMatches` | number | Max match snippets returned (default 50). |
| `maxChars` | number | Per-message cap for context messages (default 1000). |

Returns budgeted JSON with `attempts` (including on misses), `matchedMessages`,
`truncated`, and ≤300-character snippets. Each includes `msgIndex` and
`matchPosition` for anchored `HistoryRead`.

### `HistoryRead`

Pull fuller context from one session returned by `HistorySearch`.

| Param | Type | Notes |
|---|---|---|
| `sessionId` | string (optional) | From a `HistorySearch` hit. |
| `branchId` | string (optional) | Read by branch id (same id as the session file). |
| `around` | number | Window of messages centered on this `msgIndex`. |
| `matchPosition` | number | Center the anchored message excerpt on this search-provided character position. |
| `before` / `after` | number | Window size. For `around`: default 3 each. For `query`: context before/after each matching message, default 2 each. |
| `query` | string | Return merged, budgeted context windows around messages matching these terms. |
| `view` | `outline` \| `transcript` | Whole-session rendering (ignored with `around`/`query`). **Default `outline`** = user+assistant only, tool noise dropped (compact recall, ~60% fewer chars). `transcript` = every non-empty message. |
| `roleFilter` | `all` \| `conversation` \| `user` \| `assistant` \| `tool` | Restrict returned roles. Query mode defaults to `conversation`; whole-session defaults follow `view`. |
| `maxChars` | number | Per-message cap. Default 2000. |
| `maxMessages` | number | Maximum messages returned. Default 40 for query reads, 80 for whole-session reads. |
| `maxTotalChars` | number | Total character budget across returned messages. Default 16000 for query reads; whole-session defaults to `maxChars` as a compact outline budget. |

With neither `around` nor `query`, returns the whole session — a compact
`outline` by default, or the full `transcript`.

## Context-overflow guard

Every tool result is passed through a **context-overflow guard** before it
reaches the model. The guard measures how much of the context window is still
free (`ctx.getContextUsage()`) and, when a result would otherwise overflow it,
truncates the result to a safe budget and prepends an actionable warning telling
the agent how to fetch less (narrower query, `around:<msgIndex>`, `HistoryGrep`,
lower `maxMessages`/`maxTotalChars`).

The per-result budget is the smaller of:

- `maxResultChars` (an absolute cap), and
- `remaining_tokens × maxContextFraction × charsPerToken` — a result may consume
  at most `maxContextFraction` of whatever context is left, so the other half
  stays free for the actual conversation.

It is floored at `minResultChars` so a nearly-full window still returns a usable
sliver. `HistoryRead` additionally feeds this budget into the read itself (when
no explicit `maxTotalChars` is given), so a huge session clips at message
boundaries rather than mid-stream. When context usage is unknown (e.g. right
after compaction, or print/rpc mode), only the absolute cap applies. Only the
result's text is context-guarded. Search `details` contain only the budgeted
hits, not hidden full metadata. A stricter custom context guard may further
truncate the serialized response.

### TUI overlay (humans)

You can search history interactively, not just via the agent tools:

- **`Ctrl+Shift+F`** — open the live search overlay.
- **`/history`** — open the same overlay (in an interactive TUI). `/history <query>` opens it seeded with that query.
- **`/history branches`** — list branches for the current session tree.

In the overlay:

| Key | Action |
|---|---|
| type | live-filter the current project's history |
| `↑` / `↓` | move selection (empty query shows recent sessions) |
| `Enter` | preview the selected session (jumps to the first match) |
| `↑` / `↓` / `PgUp` / `PgDn` | scroll the preview |
| `Esc` / `←` | back to results (from preview) |
| `Ctrl+U` | clear the query |
| `Esc` | close |

Headless (rpc/print) `/history <query>` prints ranked results instead; `/history
stats` and `/history reindex` manage the index in any mode.

## Where the index lives — and why

The index is **colocated per project**, inside pi's own session directory:

```
~/.pi/agent/sessions/
  --home-user-code-myapp--/
      2026-...session.jsonl
      .history/  →  .pi-history/index.db   (+ -wal, -shm)
```

The guiding invariant: **the index is reachable exactly when the sessions it
indexes are reachable.** That choice falls out of the "works with and without
oqto" requirement:

- **Without oqto** — it depends only on pi's native session layout, so it just
  works; one index per project.
- **With oqto's sandbox** — when the sandbox restricts an agent to its own
  sessions, the matching index is restricted with it. There is no shared global
  database that a sandboxed agent could open to read other projects' history.

The **current project** is indexed read-write and incrementally (only files
whose mtime changed). Other projects (reached only via `scope:"all"`) are queried
read-only when an index already exists, or scanned live otherwise — the
extension never writes into another project's directory. Each project's index is
maintained by agents working in that project.

## Configuration

Loaded from the first match of: `./history-search.json`,
`./.pi/history-search.json`, `~/.pi/agent/history-search.json`. See
`history-search.schema.json` and `history-search.example.json`.

| Key | Default | Description |
|---|---|---|
| `enabled` | `true` | Master switch. |
| `sessionsDir` | `null` | Override pi's sessions base (else `$PI_SESSIONS_DIR`, else `~/.pi/agent/sessions`). |
| `indexOnStart` | `true` | Incrementally index the current project on `session_start`. |
| `includeToolResults` | `true` | Background/overlay indexing preference. Agent recall always includes tool evidence. |
| `maxResults` | `10` | Default sessions per search. |
| `snippetsPerSession` | `3` | Overlay/index candidate snippets; agent recall emits one best snippet. |
| `excludeCurrentSession` | `true` | Exclude the current (live) session from `HistorySearch` results — it's already in context. |
| `contextGuard.enabled` | `true` | Master switch for the context-overflow guard. |
| `contextGuard.charsPerToken` | `4` | Chars-per-token estimate for budget math. |
| `contextGuard.maxContextFraction` | `0.5` | Max fraction of the *remaining* context window one result may consume. |
| `contextGuard.maxResultChars` | `60000` | Hard absolute cap on returned chars. |
| `contextGuard.minResultChars` | `4000` | Floor for the per-result budget (tiny remaining windows still get a sliver). |

## How it works

1. On `session_start`, the current project's index is brought up to date
   incrementally (by mtime), off the startup critical path.
2. `extractMessages` parses each session JSONL: user text, assistant text (no
   thinking / tool calls), and optionally tool results — one stable ordinal per
   message so search hits and `HistoryRead` line up.
3. Text is chunked (~4 KB) into an FTS5 table (`porter unicode61`). Searches use
   `MATCH` with BM25 ranking, deduplicated per session, with highlighted
   snippets.

## Dependencies

None beyond pi itself. The index uses Node's built-in `node:sqlite` (FTS5 is
compiled in) — no native module to build or version-match. Requires Node ≥ 22.5
(where `node:sqlite` is available). On older Node, the SQLite index is skipped
and search transparently falls back to a live JSONL scan.

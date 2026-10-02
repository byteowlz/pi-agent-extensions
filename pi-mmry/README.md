# pi-mmry

Visible session-start recall from [mmry](https://github.com/byteowlz/mmry), plus a memory tool scoped to the current repository.

When a session starts, pi-mmry asks mmry which memories matter for this directory and **shows you the exact text** before anything reaches the model. Your first prompt then carries that same text once, framed as untrusted observations. The system prompt is never modified, nothing is re-injected on later turns, and a resumed session is not injected again.

## Install

Requires mmry 0.14.0 or later (`mmry preview --json`). With an older or missing mmry, recall turns itself off with a visible notice. pi-mmry is not published to npm; load it from this repository:

```bash
ln -s "$(pwd)/pi-mmry" ~/.pi/agent/extensions/pi-mmry
```

## Activation

Off by default. Enable with any of:

- `pi --mmry-recall`
- `PI_MMRY_RECALL=1`
- `"enabled": true` in `mmry-recall.json`

## Configuration

`~/.pi/agent/mmry-recall.json` (global); `.pi/mmry-recall.json` in a project overrides individual keys. Schema: [`mmry-recall.schema.json`](./mmry-recall.schema.json), example: [`mmry-recall.example.json`](./mmry-recall.example.json).

| Key | Default | |
|---|---|---|
| `enabled` | `false` | Enable without the flag or env var |
| `mmryBin` | `"mmry"` | Binary name or path |
| `maxTokens` | `400` | Budget for the recalled block |
| `limit` | `8` | Maximum memories |
| `tools` | `true` | Give the model the `memory` tool (independent of recall) |
| `headless` | `"off"` | Without a UI: `off`, or `report` (print the block to stderr, then attach it) |
| `timeoutMs` | `5000` | Per mmry call |
| `metricsPath` | `<agent dir>/mmry-recall-metrics.jsonl` | Count-only metrics; `""` disables |
| `pullOnStart` | `false` | Run `mmry sync pull` once at session start, non-blocking (best effort; warns on failure). Independent of recall. |

Which memories are chosen (repository before general, newest first, budget, expiry, machine-specific ones, contested ones withheld) is decided by mmry, not by this extension; see mmry's "Harness integration" section.

## Lifecycle

1. **Session start**: `mmry preview --json --cwd <cwd> --max-tokens N --limit K`. The result is frozen and displayed: a widget above the editor with the verbatim block, its size, and any warnings or contested memories mmry withheld.
2. **First prompt**: the frozen block is attached once as a `mmry-recall` message; a marker (cwd, selection hash, sha256 of the bytes) is stored in the session.
3. **cwd change**: a new preview is shown first and attached on the prompt after that.
4. **Resume**: if the session already has a marker for this cwd, nothing is fetched or attached.

Without an interactive UI (`-p`, RPC), nothing is attached unless `headless` is `report`: a widget sent to a client that may not render it is not proof that you saw it.

pi-mmry refuses to attach anything if mmry returns a contested memory or an unknown schema.

## Commands

| Command | |
|---|---|
| `/memory` or `/memory preview` | Fetch and show the selection again |
| `/memory list` | The same selection with revision, scope, age, machine and expiry |
| `/memory off` | Nothing is attached in this session (kept on resume) |
| `/memory on` | Enable for this session and show the selection |

## Tool

One `memory` tool with an `action`, available whenever `tools` is on, also with recall disabled or `/memory off`: those only stop injection. It runs mmry with `--json` in the session cwd (current repository plus general memories) and returns mmry's output or error verbatim, such as a revision mismatch. Missing fields are reported without calling mmry. In the UI, calls and results are rendered as short memory lines rather than JSON; the model still gets the JSON.

| `action` | Fields |
|---|---|
| `search` | `query`, `limit?` |
| `create` | `content`, `why?`, `source?`, `scope?` (`repo`/`general`), `expires?` |
| `supersede` | `id`, `content`, `reason`, `expected_revision` |
| `deprecate` | `id`, `reason`, `expected_revision` |

## Privacy

- Memory text goes only to the active model, and only after you were shown it.
- pi-mmry never reads or writes mmry's ledger files; mmry decides what is stored and where.
- Metrics hold counts only (memories shown/attached, token estimate, tool calls, `/memory off`), never memory text or ids.
- `AGENT_CTX_*` values that mmry records are provenance, not authorization.

## Limitations

- RPC clients (including Oqto) get no recall unless `headless` is `report`; there is no acknowledgement that a client rendered the preview.
- The tool works in the session cwd's scope only; it cannot reach other repositories' memories.
- Verification: automated tests use a fake `mmry` (`test/fake-mmry.ts`) that replays fixture JSON and records argv; the argv were checked once against mmry 0.14.0 and one live `pi -p` run with `headless: "report"`. The interactive widget has not been checked by a test.

## Development

```bash
bun test pi-mmry
bun run check        # biome + typecheck for the whole repository
```

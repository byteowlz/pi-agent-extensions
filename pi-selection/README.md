# pi-selection

Reusable, content-only Questions and Review interfaces for **Pi 1.0.0**. Agents provide structured content; the extension owns native TUI, protected browser presentation, validation and private durable results. No task-specific HTML/CSS/server code is needed.

## Install and use

Load `pi-selection/index.ts` as a local Pi extension. The exact SDK baseline is 1.0.0; Node package hosts require Node >=22.19.0. The standalone CLI additionally requires Bun. This development branch is not a published/activated managed distribution.

The model-facing `Selection` tool accepts:

- `action: "ask"` (default): present and wait for submission/cancellation.
- `create`: create a draft and return its stable review ID/presentation.
- `get`: retrieve a review by ID, within the current native session scope.
- `open`: resume a draft.
- `close`: cancel a review; never execute its choices.

`presentation` is `auto`, `tui`, `browser`, `host` or `none`. Auto prefers native TUI in native Pi, negotiated compatible host bindings in RPC, then protected browser. Explicit TUI rejects RPC. Explicit host rejects missing supported bindings. `none` is useful for nonblocking draft creation, not interactive ask.

Provide `spec` for ask/create; provide `id` for get/open/close. Examples: [Questions](examples/questions.json), [Review](examples/review.json).

```json
{
  "action": "ask",
  "spec": {
    "version": 1,
    "mode": "questions",
    "title": "Choose a direction",
    "questions": [{
      "id": "direction", "header": "Direction", "title": "Which approach?",
      "kind": "single", "required": true, "allowOther": true,
      "options": [{"id": "small", "label": "Small first", "recommended": true},
                  {"id": "full", "label": "Full scope"}],
      "note": {"label": "Reason", "multiline": true, "maxLength": 2000}
    }]
  }
}
```

Question kinds: `single`, `multiple`, `text`. Stable option IDs, optional descriptions/recommendations, Other, text `multiline`/`maxLength`, multi `minSelections`/`maxSelections`, and supplemental notes are supported. Review specs provide common `choices`, `items` and optional `groups`; large inventories use search/group navigation, not an item-per-tab UI. Unknown versions/modes/fields fail closed. Recommendations are hints, not default user decisions.

## Decisions and storage

The public contract is `model.ts`. A record has a UUID review `id`, a storage `scopeId`, integer CAS `revision`, and `state: draft|submitted|cancelled`. **Native Pi scope is not Oqto platform_id.**

Answers contain `answered`, stable `selectedIds`, optional `text`/`note`, and optional `disposition: skipped|unsure`. Ordinary unanswered, explicit skipped/unsure deferral, an explicit answer choice named Unsure, blank optional text and confirmed empty multi-selection are distinct. Required/minimum constraints must be fulfilled before submission; structural/length/maximum constraints protect draft saves too. Notes alone do not answer a question.

Saving a draft is not submission. Cancelled and submitted states are terminal. Reopening/getting uses the same private store; no reconciliation by visible text or list position. CLI, extension and browser share `SelectionStore`. No Pi JSONL files are written by this extension.

Default root: `$XDG_STATE_HOME/pi-selection/reviews` or `~/.local/state/pi-selection/reviews`. Root must be owned 0700, files 0600. Existing permissive directories are rejected, not automatically chmodded. Private atomic/fsynced JSON and revision CAS protect updates. The current multiprocess kernel-lock implementation requires POSIX `flock` in `/usr/bin` or `/bin` (qualified on Linux); absent support fails closed. Persistent `.lock` inodes are intentional and must not be unlinked while processes may be using the store. Parent directories are trusted; this is not a hostile-filesystem sandbox.

## Native controls

Questions use tabs and a final review; inventories use searchable/grouped list/detail views. Tab/Shift+Tab navigate, arrows select, Enter chooses/advances, Space toggles multi, `r` opens final review, `/` searches review, `e` edits text, `n` notes, `s` skips, `u` defers as unsure, `?` resets unanswered. Editing owns ordinary letters. Multiline Enter inserts a newline; Ctrl+Enter finishes editing. **Ctrl+o switches to browser while preserving draft. Esc cancels.** Follow the on-screen help for confirm-none controls.

## Browser and runtime flags

- `--selection-state-dir DIR`: dedicated private result root.
- `--selection-lan-address PRIVATE_IP`: explicitly permit LAN fallback if tailnet cannot be used.
- `--selection-browser-ttl-ms MS`: 1 second to 1 hour; default 30 minutes.

Tailnet is preferred: discover a locally assigned Tailscale IPv4 in 100.64/10. LAN requires an explicit locally assigned RFC1918 IPv4. No automatic public/wildcard/loopback/Funnel fallback and no Tailscale Serve configuration changes. The app uses a short-lived fragment bearer token, authenticated API, strict Host/origin/CSRF, body limits and nonce CSP. Token stays in tab sessionStorage to support reload and is removed from the visible URL. URLs may appear in tool results/history; treat them as temporary credentials. Tailnet transport is protected by Tailscale; **plain HTTP LAN is not encrypted**. Do not use this for passwords/secrets.

## Host-neutral CLI

```sh
bun pi-selection/cli.ts create --scope my-review --file pi-selection/examples/questions.json
bun pi-selection/cli.ts get --scope my-review --id REVIEW_UUID
bun pi-selection/cli.ts save --scope my-review --id REVIEW_UUID --revision 0 --file answers.json
bun pi-selection/cli.ts submit --scope my-review --id REVIEW_UUID --revision 1 --file answers.json
bun pi-selection/cli.ts open --scope my-review --id REVIEW_UUID --presentation browser
bun pi-selection/cli.ts close --scope my-review --id REVIEW_UUID
```

Specify `--root DIR` for isolated storage. Create reads a spec; save/submit read an answers map; omit `--file` to read stdin. Stable JSON stdout, error stderr/nonzero status. Browser stays in foreground until shutdown/expiry. Explicit LAN: `--presentation browser --network lan --bind LOCAL_PRIVATE_IP`. Namespace selection is not authentication; the local caller already owns filesystem access. Never pass an Oqto platform ID where the native Pi scope is required.

## Optional negotiated hosts

`pi-capabilities` is optional. Only a **type-only** versioned contract import is used; absent responder means no advertised host. No arbitrary advertised endpoint is fetched. Supported schema capabilities are `selection.questions.v1` and `selection.review.v1`.

Host controls: `/selection-create`, `/selection-get`, `/selection-open`, `/selection-close`, `/selection-save`, `/selection-submit`, `/selection-ack`. JSON must include `version:1` and may include a correlated `requestId`. Save/submit require `id`, `revision`, `answers`. Close accepts an observed `revision`; multi-participant hosts must supply it so a stale view cannot cancel a newer draft (omission retains standalone cancel-current behavior). ACK requires `id` and live `bindingId`. RPC status keys are `pi-selection:reply/v1` and `pi-selection:present/v1`; presentation includes binding IDs and the scoped review. In-process presentation event is `pi-selection:present/v1`.

**Transport owner must authenticate and authorize the connected user/native session before forwarding any control.** Advertisements/renderer ACKs are routing claims, never authenticated identities or permission grants. Bind to the owning connection/request, not a global last client. Discover registered commands before sending prompt-based controls; missing commands must not fall through as model text. Suppress optimistic chat bubbles for controls. Enforce scope/ID mapping, reconnect/reload and revision conflict behavior. Multiple authorized surfaces may coexist.

Standalone startup and real Pi control-path tests are not proof of an authenticated Oqto Web/Desktop adapter. Those integrations remain separately gated; do not advertise them as deployed merely because the capability contract is implemented.

## Verification

```sh
bun test pi-selection pi-capabilities pi-todolist/widget.test.ts
node scripts/test-selection-rpc.mjs /path/to/exact/pi-1.0.0
node scripts/test-pi-1-catalog.mjs /path/to/exact/pi-1.0.0
```

RPC proof uses disposable HOME/project/stores and stripped credentials: controls are handled, results persist, model/chat messages remain empty. Browser security/CAS/expiry tests use an explicit loopback-only test helper, not a production fallback. Physical TUI, real authenticated Oqto frontend, native platform/CPU and deployment proofs must be stated separately.

Selections collect input; **they never authorize destructive/privileged operations**. Runner grants remain authoritative. Pairwise/dataset labeling is a separate future extension.

# Changelog

All notable changes to pi-agent-extensions will be documented in this file.

## [Unreleased]

### Last question above the prompt box (2.36.0)

- **pi-last-question 0.1.0**: new extension — pins the most recent user question
  in a two-line widget directly above the editor (`ui.setWidget(...,
  placement:"aboveEditor")`), with an age label and a `… ⌥Q` marker only when the
  text is cut. `ctrl+alt+q` expands the full question in a scrollable overlay
  (`enter` inserts it into the prompt box, `y` copies, `esc` closes);
  `ctrl+alt+j` jumps straight there by putting the full text in the prompt box,
  appending to a draft; `/last-question` reports it on surfaces without a TUI.
  Tracks the branch (submit, start/resume, tree navigation) and ignores assistant
  turns, tool results and custom entries.

### Card sidecar for list views, and no more risk question (2.37.0)

- **pi-turn-classify 0.4.0**: cards are now also written to a per-session sidecar
  at `<agentDir>/turn-classify/cards/<sessionId>.json` (one small file per session,
  atomic rename, 0600, last 10 turns plus `latest`). The session file remains the
  source of truth — cards travel with the session and cannot drift from the
  transcript — but a list view cannot read transcripts: this machine has 2,865
  session files and the largest is 94 MB, so rendering 50 rows would read
  gigabytes. Per-session files mean live sessions never contend, a consumer reads
  one small file per row, and deleting the directory only costs a re-read. Stale
  sidecars are pruned on session start; `cardsDir` overrides the location.
- **The `risk` question is gone.** Five-level severity scored 25% (d3) / 37.5%
  (jev) — worse than guessing, for both — because consequence is a property of
  what an action does to the world, not of a turn summary. Removing it lifted
  overall accuracy (d3 75.6% -> 81.4%). The schema is 8 questions on a clean turn,
  10 on a failed one.

### Error classification and a background corpus (2.36.0)

- **pi-turn-classify 0.3.0**: failed turns are now classified, not just flagged.
  The digest keeps the verbatim provider/tool error message (1200 chars, never
  trimmed away) and two questions are asked only for such turns: `error_kind`
  (provider_overloaded, rate_limited, auth, context_overflow, network,
  content_filter, invalid_request, bad_response, tool_failed, cancelled, unclear)
  and `error_transient`. Provider error strings churn constantly, and this is the
  strongest case for a decision model in the whole schema — measured 83-100% on
  the seed set.
- A tool failure only fails a turn when the turn produced no answer; a recovered
  `ls: no such file` is a hiccup. False positives on real sessions: 40% -> 7%.
- Fixed `agent_end` handling: pi passes `messages`, so the closing answer and the
  `errorMessage` now come from the turn itself.
- **Background dataset**: `dataset.path` appends every finished turn (digest,
  model answers with raw probabilities, error text, provenance) to JSONL with size
  rotation; failed classifications are recorded too, with the reason. The labeler
  can read it directly (`--from-dataset`), and only human labels ever become
  scoring samples.
- Schema v2: `work_done` + `blocked` replace the five-way `status`.
- Measured: d3-lite 75.6-81.0% / ECE 0.107-0.129, jev 74.4-78.2% / ECE 0.055-0.070.
  `risk` scores 25%/37.5% and should become a binary "irreversible action?".

### skdlr-owned timing with in-session delivery (2.35.0)

- **pi-schedule 0.2.0**: skdlr is now a first-class *optional* integration instead
  of an export. `/schedule link <n|id> --schedule "<cron|natural>" [--queue]`
  registers a real skdlr schedule whose command is this extension's self-contained
  deliverer, which hands the prompt to the running session over a private inbox
  socket (`schedule/inbox/<sessionId>.sock`, dir 0700, socket 0600, absolute
  `--agent-dir` so a systemd unit needs no environment). skdlr owns the timing;
  the extension owns delivery into the live session, which `pi -p` cannot do
  without opening a different session.
- Linking is exclusive — a linked action stops using its in-session timer, so it
  cannot fire twice; `/schedule unlink` removes the skdlr schedule (with `--yes`,
  verified by re-listing) and restores the timer; `/schedule skdlr` reports
  backend status and linked actions. Link/unlink resolve selectors across both
  scopes so `/schedule link 1` works on a project action without `--project`.
- `--queue` parks a run that finds no live session (bounded to 20 entries / 24 h);
  the next start delivers them prefixed `[scheduled <age> ago]` and reports
  dropped stale ones. Without it a missed run fails visibly (deliverer exit 1).
- Quoted-argument parsing (`splitArgs`) so cron expressions like
  `--schedule "0 9 * * 1-5"` and prompts with spaces survive intact.
- Inbox hardening: created only for long-lived sessions, idempotent stale-socket
  clearing, removed on shutdown, oversized payloads and silent connections
  rejected instead of buffered.

### Turn labelling UI for calibration (2.35.0)

- **pi-turn-classify 0.2.0**: `labeler/` — a web UI for hand-labelling real agent
  turns, because 14 self-written seed turns cannot decide between d3 and jev or
  calibrate confidence. `extract.ts` turns the session store into digests
  (closing answer, tool trail, files, commands, cwd, git remotes; deduplicated
  across forks; pleasantries dropped) and `server.ts` serves them tailnet-only
  with seven keyboard-driven questions. `labels.jsonl` is already bench-sample
  format, so the corpus feeds `bench.ts` and a calibration fit directly.
  Registered in owlznest as "turn labeler".
- The labeler asks the **v2** field set (`work_done` + `blocked` + `attention`
  instead of the five-way `status`), matching the intended display line
  `<dir> working on <topic>[ in <target>] · <working|idle|blocked> <reason>`.

### Recurring in-session prompts, decoupled from the captain (2.34.0)

- **pi-schedule 0.1.0**: new extension — `/schedule <interval> "<prompt>"` delivers
  recurring prompts into the live session (`followUp` while streaming) so a
  periodic check keeps the session's own context. Two scopes: **session**
  (`~/.pi/agent/schedule/sessions/<sessionId>.json`, follows resume/reload and is
  not inherited by forks) and **project** (`.../projects/<encoded-cwd>.json`).
  Project actions arm in exactly one session — the one holding the project's
  captain claim — and stay dormant and explicit when no captain is claimed, so a
  project check never fires twice. Every tick re-reads the store and re-checks
  ownership, so pause/resume/edit/remove and captain handover take effect without
  a restart; a prompt refused during compaction is parked and flushed on
  `session_compact`/`_failed`. Commands: `list`, `pause`, `resume`, `run`,
  `remove`, `export`. Publishes a `schedule` status segment (`2·14m`).
  `/schedule export` prints the equivalent headless `skdlr add …` per action;
  skdlr is intentionally not a runtime dependency (a skdlr run is a separate
  `pi -p` with its own session and no access to live state).
- **pi-session-tools**: `/captain` no longer owns scheduling. The scheduler that
  briefly lived behind `/captain schedule` moved to pi-schedule, which reads the
  claim file to decide where project-scoped checks run — captain stays a
  designation about intake, scheduling stays a general capability, and the
  captain badge no longer encodes scheduled work.

### Fuzzy project switching (2.33.0)

- **pi-session-cwd 0.2.0**: `/move` moves a session to a project by fuzzy name
  (`/move foxline`), or opens a picker over configured roots when called bare.
  An ambiguous query (`/move fox` matching foxline and foxhole) asks with a
  pre-filtered picker instead of guessing; exact/clear-prefix matches move
  immediately; RPC/print error with the candidate list. Roots are configurable
  via `.pi/session-cwd.json` or `~/.pi/agent/session-cwd.json`
  (`roots`, `depth`, `includeSessionDirs`), defaulting to `~/work` and
  `~/byteowlz` with a safe fallback when the file is missing or malformed.
  `/move` also accepts literal paths. Replaces `/mvcwd`. The move already ends
  in the new session: `switchSession` re-homes the runtime, so pi reports
  "Resumed session" and later turns resolve the new project.

### Turn classification with a decision model (2.32.0)

- **pi-turn-classify 0.1.0**: new extension — classifies every finished turn with
  a decision model (Jeff / D3 / Clef) instead of a chat model, and stores a turn
  card as a `pi-turn-classify:card/v1` custom entry (never LLM context). Seven
  closed questions: which project the work really belongs to (with
  `project_mismatch`, so working in one directory for another project is
  visible), activity, status, attention needed, risk (score), artifact and scope.
  The one-line card is composed from answer ids, so it cannot invent content.
- Speaks both APIs: TypeSafe System One (`/v1/systemone`) and the OpenAI
  Decisions API (`/v1/decisions`). D3 checkpoints reject `instructions` with 400,
  so `"instructions": "auto"` omits them for `vllm-sr/d3*` and a 400 mentioning
  instructions retries once without them.
- Calibration-aware: choices below `confidenceFloor` render as `unclear`, a 0.5
  yes/no counts as no answer, raw probabilities are always stored, and `bench.ts`
  reports accuracy, ECE, high-confidence accuracy and latency over a 14-turn
  hand-labelled seed set. Off by default; `/classify off` is a no-reload kill
  switch; classification never blocks or fails a turn.

### Move a session to another working directory (2.30.0)

- **pi-session-cwd 0.1.0**: new extension — `/cwd <path>` moves the running
  session to another working directory and takes the session file with it:
  header `cwd` rewritten, JSONL staged and moved into the target cwd's session
  directory, then `ctx.switchSession` rebuilds the runtime so tools, project
  `AGENTS.md`/settings and extension cwd follow. History, branches, labels,
  session name and other in-session state survive because the file moves rather
  than being rewritten. `/mvcwd` picks from directories that already have
  sessions; `/cwd-history` lists moves (recorded as `pi-session-cwd:move/v1`
  entries, never LLM context). Interactive surfaces confirm first; RPC/print
  require `--force` so a remote one-liner cannot silently relocate a session.

### pi-openui: terminal-native navigation, sharp corners (2.29.2)

- **pi-openui 0.1.2**: fixed a wrong-answer bug: ↑/↓ inside an option list changed
  the selected value, so navigating to "Go" could send a different choice than
  the user meant (reported: picked "web renderer", agent received "kitty").
  ↑/↓/tab now only move focus; every option is its own entry; Enter/space choose,
  1-9 pick in the focused group, Enter on an option in a single-field form
  chooses and submits. Regression test covers the reported case. Cards use sharp
  corners (Oqto identity).

### pi-openui loads when installed (2.29.1)

- **pi-openui 0.1.1**: installed copies failed with "Cannot find module
  '@byteowlz/oqto-openui'" because `just install` copies only the extension
  folder. The profile (parser, prompt, fixtures, lang-core, zod) is now a
  vendored, generated bundle `openui-vendor.js` inside the folder
  (`bun run pi-openui/vendor-src/build.ts` to refresh). A test fails if the
  extension imports anything outside its folder besides Pi packages.

### Agent-generated UI in the TUI (2.29.0)

- **pi-openui 0.1.0 (new)**: renders OpenUI Lang programs from the Oqto profile
  (oqto-openui v0.2.1, OpenUI's full vocabulary) natively in the Pi TUI and
  returns `@Answer` values to the agent. `/openui on|off|status` per session
  (persisted, off by default: no prompt, tool inactive), `/openui demo` for local
  previews. Cells-level rendering: layout, KPI tiles, tabs, accordions, steps,
  tables and editable tables, Braille charts, forms. Never answers outside the
  interactive TUI; non-answer actions are reported, not executed. OpenUI
  telemetry blocked. Kitty graphics level not yet included.

### Remote input survives the compaction window (2.28.0)

- **pi-xlatch-session 2.0.5**: shares arriving while pi compacts its context
  are no longer lost to pi's "Cannot submit a prompt while compaction is in
  progress" refusal. They are parked (bounded FIFO, 50), acked to the phone
  with `delivery: "parked"` immediately, and flushed in order when
  `session_compact`/`session_compact_failed` fires (both fire even for
  aborted compactions). A refusal that slips past the compaction flag parks
  anyway; shutdown never hands parked content to a different session.
- **pi-tui-rpc**: remote `prompt`s during the same window now park and flush
  on compaction end instead of surfacing the raw core error.
  `get_state` reports the real `isCompacting`; parked prompts reply
  `{ delivered: "parked_compacting" }` immediately; `steer`/`follow_up` fail
  fast with a clear "compaction in progress" error (they are meaningless
  while the model output is paused for compaction).

### Bounded blocking dialogs (2.27.0)

- **pi-session-tools**: subagent spawn confirmations no longer wait forever in
  `allowMode: "confirm"`. `confirmTimeoutMs` (default 60000, env-styled ceiling
  1 h, `0` = unbounded opt-out) bounds the dialog; expiry auto-denies (safe to
  automate) and never auto-allows. Abort signals deny immediately in both
  confirm and timeout modes. RPC confirms also resolve closed (deny) on
  expiry. `/subagent timeout <ms>` sets the bound; `/subagent` status shows the
  countdown.
- **pi-tui-rpc**: the remote-takeover TUI confirmation auto-denies after 120 s
  (`PI_TUI_RPC_TAKEOVER_TIMEOUT_S`, `0` = unbounded), so an unattended session
  cannot wedge on a remote-triggered dialog.
- **pi-auto-rename 1.6.1**: deferring the name-history sidecar record on
  `session_info_changed` no longer crashes fast print-mode sessions when the
  extension ctx goes stale before the 50 ms watchdog fires (surfaced by the
  print-exit e2e full-set load).

### Context limit per session (2.26.0)

- **pi-ctx-limit 0.1.0**: new extension — `/ctx` (alias `/context`) sets a
  per-session compaction threshold. Direct size args (`/ctx 262k`) or a fuzzy
  preset picker; compacts immediately when already over the limit. The stored
  limit is branch-relative (survives forks) and soft-capped by the model
  context window minus `reserveTokens` (so it never disables pi's native
  compaction trigger).

### Auto-rename model picker and name history (2.25.1)

- **pi-auto-rename 1.6.0**: `/auto-rename model` fuzzy picker with context-window
  badges; `sync|inbound|outbound on|off` explicit toggles; name history with
  provenance via `recordName` sidecar entries and `/auto-rename history`;
  configurable `maxNameLength`.

### pi-tui-rpc: remote input without a terminal prompt again (2.24.0)

- **pi-tui-rpc**: restore the 2026-09-17 default that 2.13.0 reverted without a documented
  decision (the README kept describing it): a remote lease request is granted at once and any
  terminal keystroke takes input back. `PI_TUI_RPC_LEASE_CONFIRM=1` still asks the terminal.
  Leases no longer expire after 60 seconds while their connection stays open; the
  connection-scoped lease, disconnect fencing and terminal reclaim from 2.13.0 are kept.

### EAVS off-level mapping and session affinity (2.23.7)

- **pi-eavs 0.2.7**: unites both 0.2.5 lineages and 0.2.6 — per-model native APIs with `max` thinking level, `x-session-affinity` header, catalog `forceAdaptiveThinking` for Anthropic models, and Pi's off level mapped to a declared `none`/`off` effort.

### EAVS thinking levels from the catalog (2.23.5)

- **pi-eavs 0.2.4**: offer only the thinking levels the upstream accepts, from the EAVS catalog's `reasoning_efforts`.

### EAVS upstream error messages (2.23.4)

- **pi-eavs 0.2.3**: HTTP rejections show the upstream's sanitized error message (bounded, single-line, secrets redacted) instead of only the status.

### EAVS failure stages (2.23.2)

- **pi-eavs 0.2.2**: stage-specific inference errors (with safe network codes and request size); API clients imported from the embedded `pi-ai/compat` module.

### EAVS provider pinning (2.23.1)

- **pi-eavs 0.2.1**: send `X-Provider` on every projected request alongside the provider-pinned path; warn about hand-written `models.json` entries that target the EAVS gateway directly.

### Explicit EAVS HTTP exceptions (2.23.0)

- **pi-eavs 0.2.0**: exact-origin HTTP opt-in with native login consent before secret entry; session-only or private saved user exceptions. No implicit localhost/tailnet trust, project-granted exceptions, redirects, proxies or TLS relaxation.
- Preserve safe inference HTTP status diagnostics without exposing upstream error bodies; distinguish pre-response transport/setup failures.

### EAVS catalog visibility diagnostics (2.22.2)

- **pi-eavs 0.1.2**: restore self-hosted models with missing pricing; label unknown prices explicitly and preserve the distinction across cached metadata. Report accepted/omitted/unknown-price counts without changing gateway policy. Pi numeric costs use documented zero accounting placeholders for unknown prices.

### Sudo guard ignores heredoc prose (2.22.1)

- **pi-sudo 2.1.1**: the guard no longer treats heredoc bodies as executable
  command text unless a local shell runs them. `git commit -F - <<EOF` messages
  and `ssh … <<'EOF'` stdin containing the word "sudo" (quoted, backticked or
  plain) no longer block; `bash <<EOF … sudo … EOF` still does. The remote `ssh`
  branch keeps inspecting the raw command line (so `ssh host 'sudo …'` is still
  blocked) with heredoc bodies removed.

### Selection ask contrast pass (2.22.1)

- **pi-selection 2.19.1**: restyle the ask panel after OpenCode's question
  prompt — neutral panel with accent `┃` side bars (body contrast 5.25:1 ->
  7.20:1), numbered options, active row on `selectedBg`, picked options in
  `success` with `✓`, compact header tabs, multi hint and bottom padding.

### Session surgeon: sandboxed agentic history rewrite (2.22.0)

- New **pi-session-surgeon 0.1.0**: `/surgeon` stages a 0600 copy of the current
  session, proves a restriction-only `oqto-sandbox` overlay (`--overlay` +
  `--print-effective --json`, ADR 0070), runs a dedicated Pi agent inside it,
  verifies the JSONL, reviews the diff and publishes a new branch. The original
  session is untouched.
- The agent gets only `session_surgery` (list/show/replace/verify) plus
  read/grep; text-only replacement preserves ids/parents/timestamps/tool blocks
  with atomic writes and a `.bak`.
- Fails closed without `oqto-sandbox`; no Docker path (ADR 0070 does not cover
  Docker placement). Non-Linux backends verify by `--dry-run` and state the
  effective-report gap.

### Loaded instructions editor (2.22.0)

- **pi-agents-edit 1.0.0**: `/agents-edit` lists loaded AGENTS.md paths and opens
  the selected original in VISUAL/EDITOR, restoring the terminal afterwards.

### Hidden edit-agent continuation prompt (2.21.0)

- **pi-edit-agent 2.1.0**: `/edit-agent` no longer injects a visible
  "I edited your previous message" turn. The continuation prompt is sent as a
  hidden custom message (`display: false`, `triggerTurn: true`), so the model
  still knows about the edit while the transcript stays clean. Opt out with
  `hideContinuePrompt: false`.

### Session routing description (2.20.0)

- **pi-auto-rename 1.5.0**: add a routing description stored as an append-only
  `pi-auto-rename:description/v1` custom session entry (durable, travels with the
  file, never in LLM context). Agent surface: `describe_session` (<=280 chars,
  <=8 topic slugs, control chars stripped, secret-shaped text rejected). Human
  surface: `/auto-rename describe [text|--clear]`, and human text wins. Forks
  re-append with `inheritedFrom`. Emits `pi-auto-rename:described/v1`.
- **pi-tui-rpc**: `get_state` now returns `sessionDescription` and broadcasts a
  `session_described` event, so routing clients can query over the existing
  local socket instead of parsing session files.
- The description is routing metadata only; it must never be treated as
  permission or authority.

### EAVS scoped login and automatic policy refresh (2.20.0)

- **pi-eavs 0.1.0**: self-contained native API-key `/login`, persisted server
  metadata, scoped chat discovery/cache and native API dispatch. Explicitly
  documents unencrypted Pi auth storage and one saved connection.
- Session-scoped bounded metadata polling with backoff, cancellation, logout/
  shutdown cleanup and `PI_OFFLINE`; no provider probes or inference.
- Offline SDK lifecycle/dispatch tests and local HTTPS security fixtures.

### Ask timeout and blocked status (2.19.0)

- **pi-selection 2.19.0**: `ask` gets a default 10-minute wait budget
  (`--selection-ask-timeout-ms`, 0 disables, max 1 hour). On timeout the
  presentation aborts, the draft is cancelled and the agent gets a clear
  `SelectionTimeoutError`.
- While an `ask` blocks, the Herdr pane is reported as `blocked`
  (`--source pi-selection`) and released afterwards; no-op outside Herdr.

### Subagent tabs keep their [sub] marker (2.18.1)

- **pi-auto-rename 1.4.1**: host tab titles keep the `[sub]` role marker, so
  subagent tabs are identifiable at a glance. Only `[side]` remains stripped for
  presentation; the canonical Pi name is unchanged and inbound sync still
  round-trips without duplication.

### Open-only todos, Nerd Font status glyphs (2.18.0)

- **pi-todolist 1.6.0/1.7.0**: list only open todos. Completed and cancelled
  items are summarized (`✓ N todos done`) instead of rendered line by line, in
  the widget, `/todo list` and the tool result — including expanded mode.
  Expanded still shows every open todo. New `maxContentLength` (default 160,
  0 = off) truncates overlong content on write and render, so models cannot bloat
  the panel; the tool description now asks for one short line.
- **pi-statusline** example and the live manifest use Nerd Font glyphs
  (`\uF084` key, `\uF132` shield) rather than emoji for the `ssh-key` and
  `sudo` segments.

### SSH and sudo status segments (2.18.0)

- **pi-statusline**: new opt-in `colorValue` colors the published value as well
  as the label; example manifest gains `ssh-key` and the three `sudo` severity
  keys.
- **pi-sudo 2.1.0**: publishes the cached-password countdown as one of
  `sudo` / `sudo-warn` (≤2m) / `sudo-crit` (≤30s), so the symbol changes color as
  time runs out. Value is remaining time (plus `· Nt` for turn limits), refreshed
  every 5s and cleared on expiry/forget/shutdown.
- **pi-ssh-key 1.4.0**: publishes `ssh-key` while keys are loaded — count plus
  the soonest remaining timeout when one was requested — tracking per-key expiry
  and clearing on unload/shutdown.

### Grab links, tokens and IDs from the session (2.17.0)

- New **pi-link-picker 1.0.0**: `/grab` extracts URLs, file paths, `KEY=value`
  env assignments, tokens/secrets, IDs (issue IDs, UUIDs, SHAs) and network
  endpoints (`ip:port`, `host:port`) from the current session branch, with a
  category-tabbed, filterable picker.
- Copying uses **OSC 52** (no clipboard binary; works over SSH/Herdr, with tmux
  DCS passthrough). Oversized values fail closed and paste into the editor.
  Secret-looking values are redacted in previews and can be revealed with `v`.
  Current session only; nothing is uploaded, written to disk or sent to a model.

### Steer finished-subagent notifications (2.16.1)

- A finished subagent is now injected with `deliverAs: "steer"` instead of
  `"followUp"`, so the parent agent acts on it in the running turn rather than
  discovering it after the turn completes. Regression test asserts the delivery
  mode and message content.

### Selection ask UX and explicit none (2.16.0)

- The `ask` TUI now always shows **✎ Enter your own answer…** and
  **— None of the above** rows for single/multiple questions. Own text no longer
  requires the legacy `allowOther` flag.
- `Answer.none` records an explicit "none of the above": it satisfies required
  questions and clears `minSelections`, and stays distinct from unanswered/
  skipped/unsure. It cannot carry selections or text.
- The question block renders on a theme-derived yellow-tinted panel with clearer
  spacing; the tool call line summarizes the spec instead of echoing raw JSON.
- Browser fallback gains the same own-answer field and none button.

### Concise xlatch file sharing (2.15.4)

- **pi-xlatch-session 2.0.3**: remove repeated file-sharing boilerplate; keep the sender note and local paths visible.

### Faster pi-nym redaction (2.15.3)

- **pi-nym 0.4.0**: the reviewed values are applied without a second scan, and
  repeated scans reuse nym's NER cache.

### pi-nym category selection (2.15.2)

- **pi-nym 0.3.0**: whole categories can be selected or unselected in the
  redaction menu, with folding and a category overview for long lists.

### pi-nym progress bar (2.15.1)

- **pi-nym 0.2.0**: progress bar while nym scans and redacts, from nym's new
  `--progress-json` events.

### Local session redaction (2.15.0)

- New **pi-nym 0.1.0**: `/nym` redacts the current session with nym's local trace
  anonymization, after a grouped checklist of every value it would replace, into a
  new session it switches to. The original is kept, deleted, or stored as a
  verified GnuPG backup keyed by a kyz secret; `/nym-restore` brings it back.
  Cloud-model guard and a startup warning when `nym` is missing from PATH.

### Tool catalog audit script

- Added `scripts/list-tools.mjs` (`npm run tools:list`): lists every tool and
  action-style sub-tool the extensions register, using the installed Pi runtime
  as the authority. It probes `pi.getAllTools()`/`pi.getCommands()` in an
  isolated offline sandbox (synthetic provider, stubbed service CLIs, no session
  files, no credentials), attributes tools to extensions by `sourceInfo.path`,
  extracts enum discriminators as sub-tools, recovers `label`/`promptSnippet`
  via a static scan, and flags naming/nesting findings (non-snake_case names,
  optional discriminators, missing promptSnippets, builtin shadowing, duplicate
  names). Supports `--json`, `--grep`, `--only`, `--all`, and `--check`.

### Inbound tab-title sync (2.14.0)

- **pi-auto-rename 1.4.0**: opt-in `syncTabTitleInbound` applies host tab
  renames to the Pi session name while preserving the canonical readable id.
  Herdr listens to `tab.renamed` over the session socket (no core changes);
  tmux uses a per-window `window-renamed` hook. Ownership is re-verified per
  event (foreign/hijacked/shared tabs ignored), id-shaped suffixes are stripped
  to prevent spoofing, pushed titles are echo-suppressed, and listeners stop on
  session replacement/shutdown. Toggle at runtime with `/auto-rename sync`
  (inbound, applies immediately) and `/auto-rename outbound`; both persist to
  the effective config file and never clobber invalid operator JSON.

### Off-thread history and startup diagnosis (2.13.0)

- Run history searches/indexing/reads/grep/branch enumeration and overlay previews
  in bounded cancellable child processes. Debounce overlay queries, cancel stale
  work and stop workers on session replacement/shutdown. Ship a self-contained
  worker artifact with freshness/copied-install/UTF-8/responsiveness tests.
- Add bounded isolated synthetic PTY startup probe. Bare regular/fullscreen and
  history/TUI-RPC combinations respond; affected-host startup hang remains under
  diagnosis, separate from eliminating main-thread history work.

### Reviewed conversation rewrite branches (2.12.0)

- New **pi-conversation-edit 1.0.0**: `/rewrite` selects whole projected text
  messages for native/external-editor or optional tool-less AI rewriting. Require
  per-message diff review and final confirmation before publishing/switching to
  an independent native fork. Keep later context by default; optional restart.
- Preserve source history and tool records, stage completed forks privately,
  fence stale sessions and protect unsent drafts/non-text content. `/rewrite inspect`
  previews future editable context; historical bubbles remain original.

### Caller-owned terminal tab titles (2.11.0)

- **pi-auto-rename 1.3.0**: independently toggleable Pi → Herdr/tmux title
  projection. Preserve canonical readable IDs in Pi, strip known suffixes and
  sub/side roles only for tab display. Never target UI focus; skip shared panes
  and fence obsolete work on session replacement. Includes isolated tmux proof.

### Selection portable kernel locking (2.10.2)

- Use Python 3 stdlib fcntl locks on macOS and when Linux flock is absent;
  preserve crash release, private persistent inodes and fail-closed updates.
- Bound helper startup and report actionable missing-backend errors. Linux
  exclusion/crash/interoperability regressions pass; native Mac smoke test pending.

### SSH key picker shortcut safety (2.10.1)

- **pi-ssh-key 1.2.2**: select-all now requires Ctrl+A; ordinary a/A remain
  filter text. Updated help and picker interaction regressions.

### Scoped prompt stash and editor-fill commands (2.10.0)

- New **pi-prompt-stash 1.0.0**: Ctrl+Alt+S parks/stashes drafts without replacing
  editor text; /stash, /park and /pop manage session, exact-cwd and global private
  JSON sidecars. Save before clearing, verify restoration before removal.
- Searchable user-role history multi-selection, all recorded branches and raw
  pre-compaction prompts; full preview, attachment-omission confirmation,
  stash/promote/both actions. Broader scans are explicit, asynchronous and bounded.
- Reviewed scoped p- commands fill the editor only: no provider calls, submission,
  executable generation or model tools. Nonempty/changed drafts, command collisions
  and stale session UI are guarded. Atomic private stores with fail-fast locking.
- Delegated /side tmux diagnosis added three whole-file fork regressions. Current
  source and official Pi1 preserve raw pre-compaction and latest messages; the
  reported loss was not reproduced. Compaction still limits projected/displayed
  context intentionally; this is regression evidence, not a claimed tmux fix.

### SSH-agent connection and cache recovery (2.9.2)

- **pi-ssh-key 1.2.1:** bounded SSH protocol liveness checks replace inode/PID
  assumptions, including borrowed agents with no PID. Rebind changed sockets
  and clear stale key/passphrase bookkeeping; guard unload/lifetime refresh.
- Inherited govnr/forwarded/host outages fail closed without private-agent
  fallback; owned agents can restart keyless. Pending probes are fenced on
  shutdown, stale PIDs aren't signalled, and absent env vars are truly deleted.
- Six regression tests cover real stale Unix sockets, empty/policy/silent
  agents, cache rebinding, shutdown and a disposable real owned ssh-agent.

### Quiet, stable subagent policy notices (2.9.1)

- Replace visible full-JSON settings messages with bounded, hidden agent-context hints; full diagnostic snapshots remain available through introspection.
- Compare canonical actual policy rather than volatile model registry availability/order/count/truncation. Registry refreshes no longer masquerade as settings edits, and policy checks no longer enumerate the registry.
- Regress registry-only refreshes/reordering, compact hidden updates, explicit/external changes, no-op commands and session isolation.


### Discoverable workflow intervals (2.9.0)

- Advertise accepted interval formats, examples, bounds and elapsed-time semantics
  in the workflow tool schema/prose, identifying it as a custom extension.
- Support minutely/hourly/daily/weekly aliases through the same bounded parser;
  weekly means seven elapsed days, not a chosen weekday. Ambiguous calendar,
  cron and ISO formats return immediate accepted-format hints.
- Use one shared hint in portable-core errors and model discovery; regenerate
  self-contained runtime copies. Approval/execution gates remain unchanged.
- Add regression and actual native provider/copied-extension discovery proof.
  Issue: piext-rd1z.

### Standalone workflow extension installation (2.8.1)

- Fix startup failure when copying only `pi-durable-workflow/` into the agent extensions directory: replace parent-directory runtime imports with shipped, generated local core/budget modules.
- Add deterministic runtime synchronization and freshness/import-boundary regressions; exercise the real Pi loader and RPC review from an isolated copied installation rather than only the source checkout.


### Experimental durable-workflow foundation (2.8.0)

- Add portable bounded definitions, canonical digests, revision/review/receipt contracts and 55 core regressions. Reviews are descriptive, never execution authority.
- Add `/workflow` and structured `workflow` proposal/inspection/Y-N-Edit review. Fork ownership and session-generation fences prevent inherited/stale approvals. Activation remains fail-closed.
- Isolate exact native Durable/AI/Chord1.0.4 from ordinary Pi1.0.0. Qualify text-only priming, two occurrences, same conversation, reopen/dedup, frozen version/run cap and revoked request with zero provider calls.
- Enforce authorization at model transport: Durable1.0.4 hook errors alone do not block execution. No generated tools, production grants, live schedules or installation changes are enabled.

### Selection schema discovery and validation hints (2.7.1)

- Replace opaque Selection `spec` input with a model-visible version 1 schema
  for Questions and Review, including canonical fields, bounds and an example.
- Explain that question prompts use `title`, not `text`/`question`; free-text
  answers use `kind:"text"`, and choice options use `{id,label}`.
- Report question-index paths, canonical field suggestions, allowed fields and
  supported kinds while retaining strict semantic/prototype validation.
- Regression tests reproduce the reported failure; the exact native Pi 1
  provider/tool probe verifies the actual advertised schema. Issue: piext-jeyy.

### Independent side-session identity and connections (2.7.0)

- `/side` and `/btw` launch an explicitly named `[side] Title [readable-id]`
  fork with its own UUID/file on both Herdr and tmux. Herdr creation explicitly
  targets the validated spawning workspace and retains focus.
- Add a bootstrap system hint and a durable child-owned boundary message before
  the first model request, distinguishing inherited context from live identity,
  xlatch/resource ownership, and still-shared working-directory files. Resumes
  do not duplicate the persisted message; newly forked copies get their own hint.
- Pin xlatch persisted claims to session UUIDs. Forks never auto-restore foreign
  claims or ownerless legacy state; the original parent stays connected. A child
  may explicitly connect and subsequently restore its own slot. Release active
  listeners when the same process switches session identity.
- Prove real xlatch parent/child lifecycle, isolated tmux launch/focus, and native
  Node/Pi 1 fork headers, names/UUIDs, first-request hint, durable marker and no
  inherited connection restore. Issue: piext-8cf9.

### Named subagents in their spawning workspace (2.6.0)

- Assign spawned Pi sessions a fresh UUID and `[sub] Title [readable-id]` at
  launch. The spawning agent's `tabLabel` supplies the title; the suffix uses the
  child's id and canonical naming wordlist, never the parent's environment id.
  Herdr labels and tool receipts carry the same assigned name.
- Target tab creation explicitly at the validated calling pane's live workspace,
  recheck after approval, and refuse missing/changed workspace identity instead
  of falling back to whichever workspace the user is viewing.
- Add isolated-HOME real spawn-path regressions for naming, argv, focus retention,
  workspace targeting and missing-workspace denial. No worktree required.
- Installed Herdr protocol 22 has no parent/subagent nesting API. This guarantees
  membership under the spawning workspace, not a dedicated subtree under the
  parent agent. Issue: piext-nz1c.

### Live subagent settings and introspection (2.5.0)

- `/subagent mode auto`, `noconfirm`, and explicitly applied auto-mode loadouts
  now enable spawning. Explicit `off` remains respected until enabled again;
  model/kind/allowance/backend gates are unchanged.
- Introspection contributions expose effective policy, eligible registry model
  identifiers, model counts and truncation indicators as bounded structured data.
- Actual command setting changes send one non-triggering agent-visible status
  update. Out-of-band changes are attached once before the next model request.
  No-op commands, invalid input and session replacement do not duplicate notices.
- Add isolated-HOME command/lifecycle regressions, bounded contributor list tests,
  and native exact Pi 1 model-list assertions. Issue: piext-m69f.

### Coherent Pi 1 integration (2.4.1)

- Consolidate the exact Pi 1 migration, maintained/archive split, Selection and
  capability foundation, structured codemode contracts and reviewed security
  fixes, and session-backend/introspection contributor foundation into main.
- Preserve arbitrary-file xlatch delivery and unify `/todo` controls. Port the
  real-theme background-safe, width-aware Todo result renderer to pi-todolist.
- Adapt the print-exit Herdr lifecycle fix to renamed pi-session-tools and test
  actual print mode with every maintained extension, not a partial legacy list.
- Cancel deferred history startup on shutdown/replacement and capture plain cwd
  before scheduling, so callbacks never access disposed extension contexts.
- This source integration does not deploy extensions, advance Oqto release pins,
  implement history worker isolation, or authorize unsupported runner operations.

### pi-oqto-todos: background-safe truncation and width-aware result renderer (1.25.1)

- Fixed the dark "strip" that appeared on the right of truncated Todo tool-result
  rows (e.g. the `LATER:` / `PINNED:` lines). `truncateToWidth` terminates a
  truncated run with a full `\x1b[0m` reset, which also cleared the `toolSuccessBg`
  background that the tool-result shell paints onto each line. New
  `truncateToWidthBgSafe()` rewrites those full resets to a foreground-only
  `\x1b[39m`, so the success background survives across the ellipsis while the
  ellipsis and the priority marker (`v`/`!`) keep their colour. The renderer
  stays theme-agnostic — it never hardcodes the success background.
- Made the Todo tool result a width-aware `TodoResultComponent` that renders at
  the actual available width instead of a hard-coded 80/120 columns, so
  truncation always matches the panel. Used in both the expanded and collapsed
  views; the widget renderer uses the same background-safe truncation.
### Session backend foundation (2.4.0)

- Rename maintained `pi-herdr-tools` source to `pi-session-tools`; update
  active references/manifests and test fixtures. Live installs are not migrated.
- Validate session ownership before routing. Active Herdr wins over outer tmux;
  stale contexts and runner-managed ownership never silently fall through.
- Add plain-tmux `/side` and `/btw` forks in detached windows, shell-safe argv,
  stable caller targeting and isolated-server integration tests.
- Add optional bounded, deadline/cancellation-aware introspection contributions;
  session tools contribute effective policy, loadout and route explanation.
- Runner lifecycle adapter, tmux subagent lifecycle/navigation/messaging and
  backend-aware naming remain follow-up work; unavailable operations are not
  represented as implemented capabilities.

### Structured-output review fixes (2.3.1)

- Scrub standard JSON-escaped known credentials (up to three nested encodings)
  before streaming accumulation/spill and final structured/native history output.
  This is not arbitrary-encoding DLP or a sandbox boundary.
- Fence each subagent retry against abort/session changes; bound and cancel CLI
  calls, propagate approval cancellation, and distinguish cancelled receipts.
- Mark dispatched tab creation as potentially committed before awaiting its
  response; lost responses never assert no effects or trigger a blind replay.
- Cap catalog/list/read structured receipts at 32,000 UTF-8 JSON bytes, report
  lossy metadata/list projections, and preserve opaque identities. Over-budget
  single-item identity metadata fails explicitly rather than changing its ID.
- Add private-HOME lifecycle and projection regressions plus exact Node/Pi1
  checks of raw/JSON credentials in codemode, native JSONL and actual spill files.
- Budget helpers are extension-local so standalone packaging does not depend
  on another optional extension. Authoritative state is never truncated.

### Structured codemode outputs (2.3.0)

- Add explicit structured results to history, memory, Todo, introspection,
  rename, xlatch, subagent and privileged execution tools while retaining
  human-readable output. Audit maintained registrations with a coverage manifest.
- Preserve secret redaction through bash streaming, structured objects and
  spill files; add native exact Pi 1 codemode composition and abort probes.
- Consolidate todo display controls under `/todo list|expand|collapse|toggle`.
- Reconcile main's arbitrary-file xlatch delivery without downgrading Pi 1 pins.
- Optional introspection contributors and history UI-thread isolation remain
  separate follow-up work; these output contracts do not claim to fix UI stalls.

### pi-selection and pi-capabilities (2.2.0)

- Add content-only Questions/Review, native TUI and protected tailnet-first
  browser, shared durable scoped CAS results, text/Other/notes and a Bun CLI.
  Keep answered, blank/none, skipped/unsure, draft, submitted and cancelled
  distinct. Selection input never authorizes downstream actions.
- Add optional versioned presentation advertisements with expiry and lifecycle
  cleanup; the selection contract import is type-only. Host transports must
  authenticate users and authorize session scope before forwarding controls.
- Exact Pi 1.0 startup, no-chat/history control and synthetic provider/tool
  callback gates, real disposable Chromium reload/races, crash-lock/CAS and
  lifecycle tests pass. New files are warning-free; legacy collection warnings
  remain. Authenticated Oqto renderer and deployment acceptance are not claimed.

### pi-todolist: collapsed sticky widget (2.1.0)

- Default the native sticky widget to one width-bounded progress/task row.
  `tuiWidgetCollapsed: false` restores the expanded default; `/todos expand`,
  `/todos collapse` and `/todos toggle` override it until the session changes.
  Existing todo persistence, tool-result expansion, config filename and Oqto
  panel payloads are unchanged. No user config or running install is modified.


- Archive the explicitly selected `pi-crosstalk`, `pi-observational-memory`,
  `pi-acpx`, `pi-inline-macros` and `pi-message-timestamps` under `archive/`.
  Preserve source/history but exclude them from maintained discovery, checks
  and tests. All six unresolved extensions remain active, including both read
  guards. Installed user extensions/configuration are not modified.

- Rename `pi-oqto-todos` to `pi-todolist`. Tool names, commands, configuration
  filename and persisted todo/history identifiers remain unchanged. Update
  installation paths with the corresponding immutable distribution snapshot.

### Pi 1.0.0 baseline migration (2.0.0)

- Pi 1.0.0 is the supported baseline, not an optional candidate. Pin Pi SDK
  development packages exactly; require Node.js 22.19 or newer. The major
  version explicitly drops the pre-1.0 host compatibility promise.
- Move auto-rename, observational memory and crosstalk nested completions to
  the session ModelRegistry, retaining request-time credentials and provider
  headers. Crosstalk now supplies a leading system message, not the removed
  Context.systemPrompt field. Reflector errors/aborts cannot erase observations.
- Use the actual host mode: RPC has dialogs but no custom terminal components.
  Subagent approval uses RPC confirm, fails closed without an approval surface
  unless explicit auto mode is selected, and never auto-allows an RPC timeout.
  Native pickers/masked password prompts advertise their TUI-only boundary;
  history/export/key/issue workflows retain explicit non-picker alternatives.
- Oqto bridge emits RPC telemetry despite hasUI=true and clears run phase only
  at agent_settled. Its legacy count-based input binding still needs the
  coordinated runner/bridge identity migration; this entry does not claim it
  has been repaired.
- Add exhaustive named-value-import checks (including ts-nocheck files),
  completion/approval/settlement regressions, and a real Pi 1.0 catalog/startup
  smoke for the active catalog (23 extensions after the approved archival). This is not physical TUI, provider, grant,
  or every-tool-callback acceptance.
### pi-herdr-tools: fix `pi -p` never exiting (1.25.1)

- **Removed a hang in print mode** (piext-ge92): `pi --no-session -p "say ok"`
  printed the answer but never exited (consumer saw a timeout). root cause:
  the herdr socket event subscriber (`startEventSubscriber`) opened a
  long-lived socket on `session_start` when `HERDR_ENV=1`, and after
  `session_shutdown` the destroyed socket's close/error handler re-armed a 5s
  reconnect timer — an infinite reconnect loop that kept the Node event loop
  alive after the process had already answered.
- **Mode guard**: the long-lived herdr socket subscriber and subagent poll timer
  are now only armed for TUI/RPC sessions; in single-shot print/json mode they
  are skipped entirely so the process can exit promptly.
- **Lifecycle fix**: `stopEventSubscriber` now marks the subscriber stopped, and
  the socket teardown handler refuses to re-arm the reconnect timer after a
  deliberate stop. Decision logic extracted to `pi-herdr-tools/lifecycle.ts`.
- Lifecycle decisions covered by `pi-herdr-tools/lifecycle.test.ts` and the
  end-to-end `pi-herdr-tools/print-exit.e2e.test.ts` (drives a real pi binary in
  print mode, asserts exit 0 within seconds).

### pi-history-search: don't index after single-shot session teardown (1.25.1)

- **Fixed a stale-ctx crash** in the same print-mode lifecycle family: on
  `session_start` the deferred start-of-session index timer (`setTimeout`)
  read `ctx.cwd` after `session_shutdown`, throwing
  "This extension ctx is stale…" and making `pi -p` exit 1. The deferred index
  now only runs in TUI/RPC sessions and captures the `cwd` synchronously so a
  deferred timer never touches a stale ctx.

### pi-mmry: non-blocking sync pull on start (1.24.1)

- New `pullOnStart` config (default false): runs `mmry sync pull` once at
  session start, fire-and-forget so it never delays startup. Best effort — a
  failure (e.g. store not connected for git sync) only warns; local writes are
  never dropped. Independent of recall: fires even when recall is disabled.

### pi-xlatch-session: status label drops the redundant `xlatch:` prefix (1.25.0)

- The footer status value is now just the slot (`test` instead of
  `xlatch:test`); the statusline maps the `xlatch` key to the `XL` label, so
  the branding lives in the statusline rather than being duplicated in the
  value.

### pi-statusline: no images inside multiplexers by default (1.24.1)

- Inside herdr, tmux, zellij or screen, `"image": "auto"` now keeps the glyph
  and skips the Kitty graphics query. The multiplexer answers the query, not
  the terminal being viewed, and herdr forwards images to every attached
  client: an SSH client without Kitty graphics (Terminus on iOS) printed the
  commands (`Ga=t,f=32,...`) as text over the footer and editor. This
  restores the pre-1.21.1 behaviour; `"image": "on"` opts back in. The project
  icon follows the same rule.

### pi-mmry: nudge models to use the memory tool (1.24.0)

- The tool sets Pi's `promptSnippet` and `promptGuidelines` (fixed text, never
  memory content): create on corrections, stated preferences, non-obvious
  gotchas or "remember"; not for what belongs in git or an issue tracker,
  session summaries or secrets; search before creating, supersede instead of
  duplicating, fix wrong recalled memories right away.
- Tool description and recall framing describe memories as persistent memories
  for this repository and in general, and point at the tool for corrections.

### pi-mmry: readable memory tool output (1.23.0)

- `memory` calls and results render as scope, short id, revision, text and
  why/source/expiry (search collapses to five hits, ctrl+o expands) instead of
  raw JSON. The model still receives mmry's JSON unchanged.

### pi-mmry: memory tool independent of recall (1.22.1)

- The `memory` tool is available whenever `tools` is on (default), also with
  recall disabled or after `/memory off`; those only stop injection. A missing
  mmry no longer withdraws the tool; calls return mmry's error instead.

### pi-statusline: show the cwd project's icon (1.22.0)

- The right end of the pwd line shows the project's icon, following the new
  byteowlz project icon standard: `icon/icon_on_dark` or `icon/icon_on_light`
  (by theme), `.png` preferred over `.svg`, searched from the cwd up to the git
  root so the nearest icon wins in a monorepo. SVG-only icons are rasterised
  once into `~/.cache/pi-statusline/` with `rsvg-convert`, falling back to
  ImageMagick. Nothing is shown without an icon, a matching variant or Kitty
  graphics. Disable with `"projectIcon": false`.
- Exported `findProjectIcon(cwd, variant)` with tests.
- Fixed stale schema and comment text (block-art badge, default 2 rows).

### pi-statusline: 1-row badge by default (1.21.2)

- The badge now defaults to one terminal row (`icon.rows: 1`) so it sits on the
  pwd line only; set `icon.rows: 2` for the taller badge.

### pi-statusline: detect Kitty graphics by querying the terminal (1.21.1)

- The pi badge never rendered under herdr: herdr implements Kitty graphics but
  reports `TERM=xterm-256color` and passes no terminal-name variables, so
  name-based detection always fell back to the `π` glyph. Detection now sends a
  Kitty graphics query (`a=q`) plus DA1 at startup and enables the image when
  the terminal answers `OK`; replies are stripped via `tui.addInputListener` so
  they never reach the editor. Removed the terminal-name fallback.
- Draw the badge through pi-tui's `encodeKitty` with `C=1` and step past it
  explicitly, so a 2-row badge no longer moves the cursor down and breaks
  pi-tui's line accounting; text on the lines the badge spans is indented.

### pi-statusline: optional manifest-driven status footer

- New opt-in extension `pi-statusline` that renders extension statuses (\
  `ctx.ui.setStatus`) as colored segments while reproducing pi's built-in footer
  (cwd/branch, token+cost stats, context use, the current model), so nothing the
  built-in footer showed is lost. Takes each key's label/color/position from a
  central `statusline.json` manifest. Publisher/consumer separation: publishing
  extensions depend only on the core `setStatus` API and never import this; if
  it is not installed the built-in footer still shows their status.
- Leading icon: on **Kitty** terminals the real pi press-kit badge is drawn as an
  inline image (assets/*.png) sized to the statusbar height (`icon.rows`, 1-2),
  theme-aware (white mark on dark, black on light); on other terminals it falls
  back to a theme-aware `π` glyph. Adds a `showInactive` mode that dims
  tracked-but-idle segments. Manifest schema + example + README document the
  kebab extension-id key convention.

### pi-herdr-tools: preset loadouts (mode/cap/kind in addition to models)

- Loadouts can now be **full presets**, not just model-pattern arrays. A
  loadout value may be `["pattern"]` (legacy) or an object
  `{ models, mode?, max?, kinds? }`. Applying one via
  `/subagent models loadout load <name>` (or `force`) now sets the session's
  allowlist *and* pins `allowMode`, `maxSubagents`, and `allowedKinds` when the
  preset carries them; omitted fields keep the current value.
- Added a per-session `allowedKinds` override (session > config) so a preset
  can restrict which agent kinds may spawn (e.g. a `claude` preset that allows
  claude-code subagents only). The spawn gate now honors this. `models: []`
  means all models allowed (rely on `kinds` to gate kinds).
- `/subagent status` and `/subagent models loadout list` now show the active
  kinds and describe each preset fully. Backward compatible: existing
  pattern-array loadouts still work.

### pi-herdr-tools: subagent completion message queues safely

- The background completion notification (`notifyFinished`) called
  `pi.sendUserMessage(detail)` with no queue behavior, so a completion landing
  while the parent session was mid-stream threw "Agent is already processing.
  Specify streamingBehavior ('steer' or 'followUp') to queue the message."
  Now passes `{ deliverAs: "followUp" }` (queues while streaming, delivers
  now when idle). Applied the same fix to the send-relay response injection
  and the reset/notify message path.

### pi-herdr-tools: spawn-confirm ask dialog now reports blocked in herdr

- While the spawn-subagent ask dialog is up (allow mode confirm or timeout,
  including the change-model picker), the agent now reports `blocked` to
  herdr via `herdr pane report-agent --state blocked`, instead of leaving
  herdr's detection to guess about a custom TUI prompt it cannot classify.
  On close/decision it reports `working` and calls `release-agent` to hand
  lifecycle authority back to detection. Same best-effort guard as pi-sudo:
  only fires inside a herdr pane (`HERDR_ENV=1` + `HERDR_PANE_ID`).
### pi-mmry: visible session-start recall from mmry (piext-z2a0)

- **New extension, off by default** (`--mmry-recall`, `PI_MMRY_RECALL=1`, or
  `mmry-recall.json`). At session start it runs `mmry preview --json` and
  shows the exact rendered block; the first prompt then carries those same
  bytes once, framed as untrusted observations. No system-prompt rewrite, no
  per-turn re-injection, no re-injection on resume; a cwd change is shown
  again before use. Headless/RPC attach nothing unless `headless: "report"`.
- `/memory preview|list|on|off`; one `memory` tool (action
  search/create/supersede/deprecate) that shells out to mmry and passes its
  errors through; missing fields are reported without calling mmry.
- Disables itself visibly for a missing/old mmry, an unknown preview schema,
  or contested entries. Count-only metrics JSONL.

### pi-herdr-tools: fuzzy allowlist palette + catalog derive

- **/subagent models is now a fuzzy palette, not a mega-list.** The empty view
  is scoped by default: it shows only the current allowlist plus available
  loadouts (catalog tag scopes like local/data-privacy, plus config/session
  pattern presets). Typing fuzzy-searches the full model catalog (name,
  provider/id, tags) with results capped at 10 and a `provider/*` row when
  the query names a provider prefix. space/Enter toggles without closing
  (Enter advances for fast multi-add), Enter on a loadout applies it as the
  whole allowlist, Esc saves & closes, ctrl+r reverts. Replaces the old
  enumerate-every-model checkbox picker.
- **/subagent catalog derive [tag1,tag2]** bootstraps the model catalog from
  the scoped allowlist: registry models matching an allowlist pattern that
  are not yet cataloged get stub entries appended to model-catalog.json
  (label from the registry, optional tags). Existing entries keep their
  hand-tuned tags; patterns matching no registry model are reported. Refuses
  to run against an empty allowlist (that would derive everything).

### pi-herdr-tools: fix subagent spawn failing with agent_pane_busy

- A freshly created tab's root pane is only startable once its shell sits at
  its interactive prompt; under load `herdr agent start` could hit the pane
  before that and fail with `agent_pane_busy`, aborting the spawn. Both spawn
  paths (subagent tool and /side, /btw) now retry `agent start` on that
  specific error (400/800/1600ms backoff, 4 attempts) and rethrow anything
  else immediately. The subagent spawn path also converts herdr CLI failures
  into structured tool errors that carry the raw herdr error code/message
  instead of an uncaught exception.
- New exported `isPaneBusyError()` predicate with unit tests.

### oqto-todos: fix Todo tool-result line truncation overflow

- The collapsed Todo `renderResult` truncated the *content* to `maxWidth` but
  then appended the status icon (`[○] `) and the priority marker (` !`) on top
  of it, so lines overflowed the panel by ~6 columns and the trailing marker
  landed outside the status-colored region (the `!` appeared detached and
  mis-colored). `renderTodoLine` now reserves width for both the icon prefix
  and the priority suffix before truncating, and truncates the composed line
  as a final safety net. Matches the already-correct behaviour in
  `renderWidgetTodoLine`.

### oqto-todos: collapse done todos by default

- The persistent TUI widget and the collapsed Todo tool-result view now show
  only active (pending / in-progress) todos plus one dim `✓ N todos done`
  line instead of listing every completed entry. Expanding a tool result
  (or `/todos`) still shows everything line by line. The LLM-facing todo
  text used after compaction is unchanged, so the model keeps full state.


### pi-xlatch-session: theme-aware transparent icon

- Replaced the dark icon tile with transparent black and white Pi marks. New
  xlatch clients choose the appropriate variant for their current appearance.

### pi-xlatch-session: branded xlatch action icon

- Pi session actions now register with the Pi Coding Agent icon, embedded by
  xlatch for offline rendering on native clients. The integration owns the
  brand asset while xlatch remains a generic capability host.

### pi-sudo: bash guard false-positive fixes, escape hatch, configurable guard

- **Fewer false positives.** The bash guard now strips quoted spans and
  comments before matching, so `sudo` appearing only as text — commit
  messages, docs, grep patterns, the exact papercut that blocked git commits
  about this extension — no longer triggers it. Command substitutions
  (`$(…)`, backticks) are preserved because their content executes.
- **Escape hatch.** Appending the shell comment `# pi-sudo:allow` to a blocked
  command runs it anyway, with a user notification for transparency; the
  block reason and prompt guidelines now explain the token.
- **Configurable guard.** New `bashGuard` config key (`block` | `warn` | `off`,
  default `block`): `warn` allows the command with a notification, `off`
  disables the guard entirely.
- Remote ssh sudo detection hardened: `ssh host 'sudo …'` stays blocked even
  though its sudo is quoted (quoted remote commands execute remotely), while
  quoted mentions of ssh/sudo in local-only commands no longer match.

### pi-sudo: unify local and remote sudo under one sudo_exec tool

- **One tool for root, local or remote.** `sudo_exec` gains optional `host`
  and `sshOptions`: omit `host` to run locally, set it to run the command as
  `sudo bash -lc` over the user's normal SSH setup. Passwords stay cached per
  scope (`local` vs one entry per `remote:<host>`). The model no longer has to
  choose between two tools — the failure mode that pushed it back toward
  `bash ssh host sudo ...`.
- **`remote_sudo_exec` is a deprecated alias** forwarding to `sudo_exec` with
  `host` (one-time deprecation notice per session), so sessions loaded before
  the change keep working; new sessions only see `sudo_exec`.
- The bash-tool guard message now points at `sudo_exec({ host })`.

### pi-sudo: herdr blocked state, prompt timeout, configurable cache policy

- **herdr blocked state.** While a sudo (local or remote) password prompt is
  open, the pane is reported to herdr as `blocked` (source `pi-sudo`), since
  herdr's screen detection cannot classify the custom prompt UI; `working` +
  authority release is reported once the prompt resolves, so herdr's own
  detection takes over again.
- **Prompt timeout.** The password prompt now auto-cancels after
  `promptTimeoutMs` (default 120s, `0` = wait forever) with a live countdown,
  so an unattended agent is not blocked indefinitely; the tool then fails with
  a clear "prompt timed out" error instead of hanging.
- **Cache policy: time + turns.** The cached password's validity is now
  configurable via `pi-sudo.json` (`cacheTtlMs`, `cacheTurns` — both limits
  apply when set; `0` disables the respective limit) and at runtime via the
  new `/sudo-ttl <seconds> [turns]` command. `/sudo-status` shows remaining
  TTL and turns per scope plus the active policy.
- **Config file.** New `pi-sudo.json` (searched `./`, `./.pi/`,
  `~/.pi/agent/`; schema + example included) with `defaultTimeoutMs`,
  `promptTimeoutMs`, `cacheTtlMs`, `cacheTurns`, `maxPromptAttempts`.

### pi-ssh-key: fuzzy multi-select picker + herdr blocked state

- **Fuzzy multi-select picker.** `/ssh-key-load` opens a type-to-filter picker
  (name/comment/path matching) with checkbox multi-select (`space` toggle,
  `a` select all); `Enter` loads the selection, or the highlighted key when
  nothing is selected. Selected keys load one at a time so passphrase prompts
  appear sequentially, and per-key failures don't abort the rest.
- **herdr blocked state.** Same blocked/working + release reporting around the
  passphrase prompt as pi-sudo (source `pi-ssh-key`).

### pi-history-search: fix "no such table: messages_fts" under Node

- **Root cause.** The node:sqlite opener passed `undefined` options explicitly
  (`new DatabaseSync(path, undefined)`), which Node validates as a TypeError —
  so every read-write index open failed silently, indexing never ran, and
  searches fell back to read-only opens of leftover 0-byte `index.db` files
  whose queries then crashed with `no such table: messages_fts` instead of
  degrading to the live scan. Only manifests when pi runs under Node (the Bun
  branch was unaffected). The opener now omits the options argument entirely
  for read-write opens.
- **Hardening.** Read-only opens now verify the index schema before use and
  report "no index" (callers fall back to the live scan) when the file is empty
  or tableless, and the read-only search path catches query errors and degrades
  to a live scan instead of surfacing SQL errors to the tool result.

### oqto-todos: unify todo tools and add interactive `/todo` command

- Consolidated `TodoWrite`, `TodoRead`, and `Todo` into a single `Todo` tool with actions `write`, `read`, `add`, `update`, `remove`, and `clear`. The old `TodoWrite`/`TodoRead` tools are removed.
- Added an interactive `/todo` command that drives `ctx.ui` (select/input/confirm/notify) to add, start, complete, cancel, edit, delete, or clear todos ergonomically.
- Update the compaction reminder to reference only the `Todo` tool.

### oqto-todos: inherit todos across forks and clones

- On `session_start` with reason `fork` (which `/fork` and `/clone` both use), the parent session's todo file is copied into the new session's file so the task list carries over. Branches via `/tree` keep sharing the same session id and therefore the same list.

### oqto-todos: store todos under pi's session directory

- Todos now default to `<pi-session-dir>/todos/` (derived from `ctx.sessionManager.getSessionDir()`) instead of `./.pi/todos`, so they live with pi's session state rather than the project. Set `storagePath` to override; falls back to `./.pi/todos` when no session directory is available.



- **Root cause.** The node:sqlite opener passed `undefined` options explicitly
  (`new DatabaseSync(path, undefined)`), which Node validates as a TypeError —
  so every read-write index open failed silently, indexing never ran, and
  searches fell back to read-only opens of leftover 0-byte `index.db` files
  whose queries then crashed with `no such table: messages_fts` instead of
  degrading to the live scan. Only manifests when pi runs under Node (the Bun
  branch was unaffected). The opener now omits the options argument entirely
  for read-write opens.
- **Hardening.** Read-only opens now verify the index schema before use and
  report "no index" (callers fall back to the live scan) when the file is empty
  or tableless, and the read-only search path catches query errors and degrades
  to a live scan instead of surfacing SQL errors to the tool result.

### pi-herdr-tools: remote relay targets + model override on spawn confirm

- **/send lists remote herdr targets.** Agents on saved SSH machines
  (`herdr machine list`) now appear in the /send and /relay fuzzy picker
  alongside local ones, prefixed with the machine label. Picking a remote
  target routes the prompt (and the Ctrl+j cross-inject read-back) through
  `herdr --machine <profile-id>`, so it lands on the right server even when
  pane ids collide across machines. Requires herdr >= 0.9.1 locally and on the
  remote; machines that fail to answer are skipped with a warning instead of
  blocking the picker, and never fall back to Local.
- **/send picker: workspace sections + real tab labels.** Targets are grouped
  under `▾ workspace` headers (repo/dir label from `herdr workspace list`;
  remote machines group as `machine/repo`), sorted by group. Rows are labelled
  `tab label — terminal title` and everything (agents, tab labels, workspace
  labels) is fetched fresh on every /send, so renamed tabs like
  "kompressor model training" are findable even when the agent's terminal
  title is stale. The viewport grew to ~22 lines with a visible target count.
- **Change the subagent model at the spawn prompt.** In `confirm` and `timeout`
  allow modes, the spawn confirmation now offers a third action besides
  allow/deny: press `m` to fuzzy-pick a different model from all available
  models; the spawn is then approved with that model for just this spawn
  (only shown for kinds that consume a model, i.e. `pi`). While the picker is
  open the auto-decide countdown is suspended; Esc returns to the prompt with
  a fresh countdown.

### pi-herdr-tools: durable subagent history + push close events

- **Durable outcome history.** Every subagent now records a terminal `outcome`
  (`done` / `closed`) plus an `endedAt` timestamp, written to an append-only
  ledger at `~/.pi/agent/subagent-history.jsonl` and kept in the per-session
  state. New `/subagent history` lists this session's finished/closed subagents;
  `/subagent list` now shows `closed`/`done` outcomes with end time.
- **Push close detection.** Subscribes to the herdr socket's `events.subscribe`
  stream (`tab.closed` / `pane.closed` / `pane.exited`) over `HERDR_SOCKET_PATH`
  (NDJSON framing), so a tab you close directly in herdr is recorded on the next
  pushed event without a re-poll. The existing `herdr agent list` polling is kept
  as a fallback for events missed while unsubscribed.
- **fleet event emission.** `POST /events` to the gvnr fleet-intake audit log
  (`gvnr-dpty` envelope) when `GVNR_EVENT_URL` (+ `GVNR_TOKEN`) are set, carrying
  `AGENT_CTX_*` provenance — best-effort, never blocks the session.

### pi-ssh-key: load an SSH private key into a session-scoped ssh-agent

- `/ssh-key-load [path] [seconds]` picks a private key from `~/.ssh` (or a named
  path) and adds it to an ssh-agent, prompting for the passphrase through pi's
  masked UI when protected. An optional timeout (seconds) bounds the key's
  lifetime in the agent.
- Reuses the user's existing `SSH_AUTH_SOCK` when reachable; otherwise starts a
  dedicated pi-owned `ssh-agent` and sets `SSH_AUTH_SOCK`/`SSH_AGENT_PID` for the
  process, restoring them on unload/shutdown.
- `/ssh-key-unload [path]` removes one key or tears down the agent + restores env;
  `/ssh-key-timeout [seconds]` sets the loaded keys' lifetime; `/ssh-key-status`
  reports agent + keys.
- Optional `ssh-key.json` config (`keyDir`, `defaultTimeout`).
- **oqto SSH proxy sessions.** When `OQTO_SSH_AGENT=proxy` is set (owned by
  oqto-runner), `ssh-key-load` requests a grant via `OQTO_SSH_GRANT_CMD`
  (JSON stdin/stdout contract) or prints host-load + `[ssh].allowed_keys`
  guidance instead of `ssh-add`. The extension is a passive consumer of the
  contract; the oqto-runner implements the grant side in a separate oqto trx.

### pi-herdr-tools: per-session subagents, completion notifications, close/reset, timed allow, model picker

- **Per-session allowance (fix).** The subagent cap is now scoped to one pi
  session via a persistent state file
  (`~/.pi/agent/subagent-state/<sessionId>.json`). The allowance counts only
  subagents that session spawned that are still live and not `done`, so it is
  never polluted by another session's/workspace's agents, and it survives a
  resume/reload (the old in-memory `spawnedBySession` set was lost on reload,
  letting the cap reset). `/subagent max <n>` sets the session's allowance;
  `/subagent max default` falls back to the global config value.
- **Completion notification.** A background monitor polls tracked subagents and
  injects a user message into **this** session when one finishes (`done`), so
  the sending agent is told and can collect the result. Works across a reload.
- **Close/reset.** `/subagent close <name>` closes a subagent's tab;
  `/subagent reset <name> [task]` interrupts the running task (Ctrl+C), returns
  it to idle, and optionally re-prompts it.
- **Per-session allow mode.** `/subagent mode <auto|confirm|timeout>` sets how
  a spawn is approved: auto-allow, always-confirm, or a **timed prompt** that
  auto-decides (`/subagent decide <allow|deny>`) after `/subagent timeout <ms>`.
  The mode/decision/timeout are stored per session.
- **Interactive model picker + loadouts.** `/subagent models` opens a
  provider/model picker (Space to toggle a row or a whole provider, ↑↓
  navigate, type to filter, Enter saves the allowlist). Loadouts (named
  presets) are managed via `/subagent models loadout save|load|delete|list`.
- **Dual-scope loadouts + per-session model controls.** Loadouts exist in two
  scopes: **global** (`~/.pi/agent/subagent-config.json`) and **local**
  (per-session state file), e.g. `loadout save <name> [local|global]` /
  `loadout load <name>` (local first, then global if allowed). A session can
  toggle global loadouts (`allow-global <on|off>`) and pin itself to a loadout
  (`force <name>` / `force off`). The effective allowlist is resolved:
  force → session allowlist → global default, and the delegate/model check now
  uses that effective list.

### pi-oqto-todos: preserve todos across context compaction

- New `session_compact` (after-compaction) handler: after pi compacts the
  session, the extension injects the **current to-do list** into the LLM context
  as a `custom_message` entry (via `pi.sendMessage` with `triggerTurn: false`),
  with a reminder to keep using the `TodoWrite` / `TodoRead` / `Todo` tools.
- Uses the **after**-compaction hook, so the extension never re-runs or
  replaces pi's own summarizer — no extra LLM call, no API key, and the
  compaction summary itself is left untouched.
- Fixes the failure mode where a model, after a context compaction, forgot the
  todo panel existed and stopped updating it.
- Gated by new config option `preserveInCompaction` (default `true`); set to
  `false` to disable. Falls back silently on any error.

### pi-herdr-tools: relay (/send) — cross-tab response forwarding + injection

- New `/send` command (alias `/relay`): copy this agent's most recent assistant
  output, pick a target herdr agent via a **real fuzzy picker** (search box fed into a `SelectList.setFilter`, ↑↓ navigate, Enter select; own pane excluded
  via `HERDR_PANE_ID`), add an optional note, and send via
  `herdr agent prompt <pane>`.
- The target picker filters with pi-tui's `fuzzyFilter` (in-order, case-insensitive,
  gap-tolerant subsequence match over the target's terminal title + pane id, scored
  and ranked). Earlier drafts used `SelectList.setFilter`, which is only a naive
  `value.startsWith(query)` prefix match that searched the bare pane id — that made
  any non-pane-id query (e.g. `pixel`) match nothing. The picker now renders and
  navigates its own fuzzy-scored rows instead.
- Compose box is a custom TUI modal (preview + note editor): **Enter** = send to
  the target (fire-and-forget), **Ctrl+j**/**Ctrl+Enter** = **cross-inject** —
  waits for the target to settle (`prompt --wait`), reads its recent output
  (`agent read --source recent`), and feeds that response back into *this* session
  as a follow-up via `pi.sendUserMessage`, so the current agent can steer on it.
  **Esc** = cancel.
- Adds `herdrRaw` helper for reading raw (non-JSON) `agent read` output.

### pi-herdr-tools: relay (/send) — forward last response to another tab

- New `/send` command (alias `/relay`): copy this agent's most recent assistant
  output, pick a target herdr agent via a fuzzy picker (own pane excluded via
  `HERDR_PANE_ID`), add an optional note, and send via `herdr agent prompt <pane>`.
- Compose box is a custom TUI modal (preview + note editor): **Enter** = send to
  the target, **Ctrl+j**/**Ctrl+Enter** = send and also paste the message into
  this tab's editor, **Esc** = cancel.

### pi-herdr-tools: herdr-flavored delegation + session forking

- New extension (renamed from `pi-subagent-delegate`; herdr-specific, so the
  name reflects the bundle): `delegate_subagent` tool + `/subagent` config for
  agent-initiated subagent spawning, and `/side`/`/btw` to fork the current
  session into its own named herdr tab.
- Spawning is user-gated via `~/.pi/agent/subagent-config.json` (kill switch,
  confirmation prompt, model allowlist, concurrent allowance) and driven
  through the herdr CLI (`tab create -> agent start -> prompt`).
- `/side`/`/btw` fork via `pi --fork <session file>` (single-writer safety:
  each tab gets its own file, never two TUI writers on one file).

### pi-env-ctx: AGENT_CTX v2 — read herdr env directly (piext-wvx0)

- Bumped `AGENT_CTX_VERSION` to `2` and adopted the v2 producer-map contract from
  `byteowlz/schemas/agent-context-env` (platform → multiplexer → harness → host).
- New multiplexer/agent bag emitted only when `HERDR_ENV === "1"`: `AGENT_CTX_MULTIPLEXER=herdr`,
  `AGENT_CTX_AGENT_ID`/`AGENT_CTX_AGENT_ADDRESS` = `$HERDR_PANE_ID`, `AGENT_CTX_WORKSPACE_ID`
  = `$HERDR_WORKSPACE_ID` (opt). `AGENT_LABEL` deliberately deferred (needs an async socket call
  to herdr for the tab/pane title).
- New host bag always emitted: `AGENT_CTX_MACHINE_ID` (herdr machine name if exposed else
  `os.hostname()`), `AGENT_CTX_NODE_HOSTNAME`, `AGENT_CTX_OS_ARCH` (x64 → amd64).
- `readHerdrLayer`/`readHostLayer` folded into `exportAll`/`refreshFromContext`; all new vars
  added to `clearOwned`. Host access is injectable (`HostModel`) so unit tests don't touch
  `process.env`/`os`.

### pi-xlatch-session: phone share target bound to one session

## [1.5.0] - 2026-09-07

### Added - pi-tui-rpc: dual-frontend session access (piext-6j02)

- New spike extension: run pi in TUI mode and drive the SAME session from external RPC
  clients over a Unix-socket JSONL server (`PI_TUI_RPC_SOCKET`, else tmpdir per pid).
- Outbound fanout of pi extension events (agent/turn/message/tool lifecycle, model and
  thinking changes, compaction, `input`) to all connected clients; `agent_settled` is
  forwarded forward-compatibly for pi 0.85+.
- Inbound commands: `prompt` (with `streamingBehavior` mapping), `steer`, `follow_up`,
  `abort`, `get_state`, `get_messages`, `lease` request/release.
- Input lease: TUI owns input by default; remote takeover requires a TUI confirm dialog;
  TUI typing instantly reverts ownership; input commands without the lease fail with
  `lease_denied:tui_owns_input`; lease changes broadcast and shown in the TUI status bar.
- Unit tests (lease state machine, dispatch, protocol framing, hub fanout/pruning/parse
  errors) plus a tmux-driven live E2E against pi 0.85.1; session-JSONL single-writer
  integrity verified. Spike is bridge-era: pi 2 presentation attachments replace it.

## [1.4.1] - 2026-09-05

- Clarify agent hints for post-compaction recall, current-session versus related-branch scopes, anchored drilldown, and incomplete search results. Correct HistoryGrep's outdated description of HistorySearch (piext-5ydf).

## [1.4.0] - 2026-09-05

### pi-history-search: evidence-first recall (piext-xcfm)

- Literal-first identifier search (`auto`/`grep`), explicit `exact`/`regex`/`fts` modes, and disclosed regex fallback on literal misses.
- Search and grep now return budgeted JSON (3,000 chars by default), ≤300-character evidence snippets, stable message/character anchors, and honest unknown completeness. Consumers of the old prose output must adapt.
- All-role evidence selection finds tool-result field values without command/file metadata floods; strict user/assistant/tool filters remain available. Empty branch scopes no longer escape into project-wide indexed results.
- `HistoryRead` accepts `matchPosition` for evidence deep inside a message; raw message whitespace is preserved.
- Recall contract regressions live here; shared/internal before/after benchmarks live in `byteowlz/bench`, with private cases kept outside git.

### Fixed - 2026-08-07

#### pi-kyz: prevent audit status lines from leaking into the TUI

Removed the extension's direct writes to the pi process's stderr. The pseudo-audit logger emitted `[kyz] ...` status lines for tool lifecycle events and secret operations; because pi owns that terminal stream, those lines could bleed into or corrupt the interactive TUI. The current kyz CLI has no audit subcommand, so the misleading stderr fallback and its hooks were removed rather than redirected. Added a regression test asserting that tool lifecycle events do not write to process stderr.

### Added - 2026-07-15

#### pi-history-search: context-overflow guard + HistoryGrep (surgical exact search)

All history tool results now pass through a **context-overflow guard** that
checks how much of the context window is left (`ctx.getContextUsage()`) and,
when a result would overflow it, truncates to a safe budget and prepends an
actionable warning (narrower query, `around:<msgIndex>`, `HistoryGrep`, lower
`maxMessages`/`maxTotalChars`). The budget is the smaller of an absolute cap
and `remaining_tokens × maxContextFraction × charsPerToken`, floored at a
minimum so nearly-full windows still return a sliver. `HistoryRead` also feeds
the budget into the read itself (when no explicit `maxTotalChars` is given) so a
huge session clips at message boundaries, not mid-stream. Only the result text
is guarded; structured `details` stay full. Configurable via the new
`contextGuard` block (`enabled`, `charsPerToken`, `maxContextFraction`,
`maxResultChars`, `minResultChars`).

New **`HistoryGrep`** tool: surgically and fast-search ONE session for an exact
substring or regular expression. It reads a single session file once and runs
one regex pass (no FTS, no tokenization), so it catches what tokenized
`HistorySearch` misses — code identifiers, camelCase names, stack traces, exact
error strings, file paths — and is fast even for large older sessions. Returns
pinpoint matches with `msgIndex` and a `«highlighted»` snippet; optional
`before`/`after` for a full-text context window. Typical flow: `HistorySearch`
finds the session, `HistoryGrep` extracts the exact lines.

New modules: `context-guard.ts`, plus `grepSession` in `indexer.ts`. Added unit
tests (`context-guard.test.ts`, `grep.test.ts`) covering budget math,
truncation, case sensitivity, regex, role filters, match caps, and the
zero-width-match guard.

Follow-up: the current (live) session is now excluded from `HistorySearch`
results by default (new `excludeCurrentSession` config, default `true`) — it is
already in the agent's context, so returning it is noise. The explicit
`current-branch` scope is exempt (it would otherwise always be empty).
Added `exclude-current.test.ts` (4 cases).

### Fixed - 2026-06-24

#### pi-auto-rename: avoid stale extension ctx crash after fast prompt sessions (piext-j2wq)

Guarded `pi.setSessionName` and `ctx.ui.setStatus` calls against stale extension context errors. When a short one-shot prompt completes before async rename work finishes, the extension no longer crashes the process. Added `isStaleContextError` helper and wrapped all late-bound context-dependent operations in `setNameAndNotify` and `handleRegen`. Added regression tests covering `before_agent_start` and `agent_end` hooks with simulated stale contexts.

### Added - 2026-06-16

#### pi-history-search: branch-aware scopes and branch metadata (piext-b2rp)

`HistorySearch` now supports branch-aware scopes in the current project (`current-tree`, `current-branch`, `siblings`, `ancestors`, `descendants`) in addition to `project` and `all`.

New `HistoryBranches` tool lists branches with mechanical metadata only (no summarization): branch id, parent/root ids, fork message index, created/updated timestamps, cwd, message count, last user/assistant previews, and recent touched files/commands.

`HistoryRead` can now read by `branchId` as an alternative to `sessionId`.

Config adds optional `branchAliases` (`history-search.json`) for manual human-friendly labels keyed by branch/session id.

Also added `/history branches` for interactive branch listing.

### Added - 2026-06-13

#### pi-sudo: remote sudo support

Added `remote_sudo_exec` for commands that need sudo on an SSH target. Remote sudo passwords are prompted through pi's masked UI and cached per host (`remote:<host>`) separately from the local sudo password. The bash guard now detects obvious `ssh host sudo ...` commands and tells the agent to use `remote_sudo_exec`, so the extension can distinguish local elevation from remote elevation.

### Fixed - 2026-06-11

#### pi-history-search: bounded HistoryRead output

`HistoryRead{query}` is now token-safe and more surgical by default: query reads return merged context windows around matching conversation messages unless a `roleFilter` is explicitly provided, cap results to 40 messages / 16k total characters by default, and report omitted context. Added `maxMessages` and `maxTotalChars` tool parameters for controlled expansion; `before`/`after` also tune query-match context windows.

### Changed - 2026-06-07

#### pi-markdown-export: readable "outline" rendering by default

Exports were dominated by tool output — on a sampled session, `toolResult`
messages were ~97% of the body (file dumps, command output), rendered as generic
`## System` blocks. Rendering is now an **outline** by default: user + assistant
text, with each assistant tool call shown as a compact one-liner
(a `- \`read(path)\`` list item) and tool result bodies omitted. The same sampled
session dropped from 412 KB to 15 KB (~96%). The renderer introduces no emoji or
decoration of its own — only session text is kept.

New config knobs (all back-compatible; outline is the default):

- `includeToolCalls` (default `true`) — compact `- \`tool(arg)\`` lines; set
  `false` for pure conversation.
- `includeToolResults` (default `false`) — include tool output bodies.
- `maxCharsPerMessage` (default `0` = unlimited) — per-message cap with a
  `… (truncated, N chars)` marker; pair with `includeToolResults` for a tamed
  transcript.

Tool result blocks, when included, are now labeled `## Tool` instead of
`## System`.

### Added - 2026-06-07

#### pi-markdown-export: bulk export, multi-select picker, and config-driven redaction (piext-3kk3)

Extended the markdown export extension well beyond single-session export.

- **`/export-md-all [--subdirs]`**: export every session whose working directory
  is the cwd (and, with `--subdirs`, any subdirectory) to `exportDir`
  (default `./pi-session-exports`), one `.md` per session. Directory matching
  reads each session's recorded `cwd` from its first JSONL record, so it is
  robust against pi's lossy `--{cwd}--` directory encoding.
- **`/export-md-pick [--subdirs]`**: a TUI multi-select picker (fuzzy filter,
  `Space`/`Tab` to toggle, `Ctrl+A` toggle-all, `Enter` to export) that also
  defaults to `exportDir`.
- **`markdown-export.json` config** (cwd / `.pi` / `~/.pi/agent` search order,
  with schema + example):
  - `replacements[]` — literal or regex find/replace rules.
  - `redactionCommands[]` — external CLIs run before writing. `scan` mode parses
    gitleaks/trufflehog JSON findings and masks the detected secrets; `filter`
    mode replaces the content with the command's stdout (or the in-place file).
    Missing tools degrade gracefully unless `required`.
  - `exportDir`, `includeSubdirs`, `includeThinking`, `sessionsDir`.
- **Redaction applies to all paths**, including the existing `/export-md`
  current-session command, before anything is written to disk.

Internals split into `config.ts`, `session.ts` (discovery + a shared JSONL→
Markdown renderer reused by the live-branch export), `redact.ts`, and
`picker.ts`.

### Removed - 2026-02-13

#### delegate and tmux-delegate extensions

Removed both `delegate/` and `tmux-delegate/` in favor of [pi-subagents](https://github.com/nicobailon/pi-subagents) (`pi install npm:pi-subagents`).

**Why:**

- Both extensions spawned pi subprocesses but captured only raw text output. pi-subagents uses `--mode json` to get structured event streams with token/cost tracking, tool call history, and proper abort propagation.
- tmux-delegate had multiple bugs that were never caught because the tmux visibility feature was not relied on: wrong `execute()` parameter order (params swapped between pi v0.50 and v0.52), broken exit code capture (`$PIPESTATUS` unavailable in zsh), and child sessions never created due to the parameter bug.
- The "watch live in tmux" value proposition is covered by Oqto child sessions and `onUpdate` streaming.
- pi-subagents additionally provides chain execution with `{previous}` placeholders, a TUI clarification overlay, agent management CRUD, skill injection, artifact management, and async background execution.

### Fixed - 2026-02-10

#### tmux-delegate: session manager crash and cross-project delegation (piext-v5t2)

**Problem:** `TmuxDelegate` crashed with "Cannot read properties of undefined (reading 'getSessionDir')" when `ctx.sessionManager` was undefined at runtime, and previously failed with "no active session file" when `getSessionFile()` returned `undefined`.

**Fix:** Made session linking fully optional with graceful fallback:

- Guard `ctx.sessionManager` access with optional chaining (`?.`)
- Only create linked child sessions (with `parentSession` in header) when the parent session file exists AND the task runs in the same working directory
- Cross-project delegations (different `cwd`) get their own independent sessions -- no parent link needed since they live in separate session directories
- When no session manager is available, tasks still spawn correctly; pi manages its own session in each tmux window

### Added - 2026-02-09

#### tmux-delegate extension

New delegation extension that spawns Pi subagents in visible tmux windows instead of hidden child processes. Key features:

- **Live visibility**: Each task runs in its own tmux window, switchable via `tmux select-window`
- **Oqto integration**: Child sessions are created with `parentSession` set, so Oqto renders them nested under the parent session in the sidebar
- **Async by default**: Returns immediately with run ID; use `TmuxDelegateStatus` to check progress
- **Sync mode**: Set `wait=true` to block until all tasks complete
- **Output capture**: All output piped through `tee` to both terminal and capture files
- **Agent discovery**: Uses the same markdown frontmatter agent files as the subagent extension
- **Parallel tasks**: Spawn multiple tasks in separate tmux windows simultaneously

Tools: `TmuxDelegate`, `TmuxDelegateStatus`

### Fixed - 2026-02-06

#### OAuth Compatibility - Tool Naming Convention

**Problem:** Claude Code OAuth authentication was failing with "not allowed by anthropic" errors due to tool naming violations.

**Root Cause:** Anthropic's OAuth validation requires PascalCase tool names to match built-in Claude Code tools (`Read`, `Write`, `Bash`, `Edit`, etc.). Extensions using snake_case or lowercase names were rejected.

**Changes:**

**oqto-todos extension:**

- `todowrite` → `TodoWrite`
- `todoread` → `TodoRead`  
- `todo` → `Todo`

**delegate extension:**

- `delegate` → `Delegate`
- `delegate_status` → `DelegateStatus`

**Documentation:**

- Added OAuth tool naming requirements to `AGENTS.md`
- Created `OAUTH-FIX.md` with technical details
- Updated global `~/.pi/agent/AGENTS.md` with naming convention

**Impact:**

- ✅ OAuth authentication now works
- ✅ All tools maintain full functionality
- ✅ Follows official Claude Code naming conventions
- ⚠️ Breaking: Tool names changed (old references need updating)

**Reference:** [GitHub PR #15](https://github.com/anomalyco/opencode-anthropic-auth/pull/15)

## [1.0.0] - Initial Release

### Added

- **auto-rename**: Automatic session naming using LLM
- **custom-context-files**: Inject custom context into sessions
- **oqto-todos**: Todo management integration with Oqto frontend
- **oqto-bridge**: Bridge for Oqto platform integration
- **delegate**: Spawn subagent processes for task delegation

### Infrastructure

- TypeScript configuration with strict mode
- Biome linting and formatting
- tsgo type checking
- Development scripts (check, lint, typecheck)

---

**Note:** Version numbers follow [Semantic Versioning](https://semver.org/).

# Session backend foundation

Branch feat/session-backends; base e85d9a8; epic piext-z7rx. Maintained source is now pi-session-tools. Shared feature policy/state files retain backend-neutral names subagent-config.json and subagent-state. Update deployed entry paths as a coordinated collection change; no live deployment is performed here.

## Routing policy

Lifecycle owner and terminal presentation are distinct. Oqto claim (OQTO_SESSION_ID or AGENT_CTX_PLATFORM=oqto with PLATFORM_SESSION_ID) prevents unmanaged lifecycle operations even if Herdr/tmux are present. Claims are not authorization: no runner adapter is bound yet, so this route returns unavailable. This intentionally fails closed pending runner owner's account/workspace/session contract. Platform claims and explicit bindings need further Oqto review; unknown managed environments must not be inferred from installed binaries.

Standalone Herdr claims require current pane id and socket environment plus successful pane-get identity validation. Active Herdr wins when nested in tmux. If incomplete/unreachable, there is no outer-tmux fallback. Plain tmux claims require successful calling-pane validation. Plain Pi remains usable but cannot open terminal side windows.

Herdr CLI commands revalidate routing before executing. `/side`/`/btw` dispatch to validated Herdr or tmux. tmux uses the caller's returned session ID, detached new-window, cwd, quoted argv and pi --fork; instructions are argv, never send-keys. Child launch preserves tmux-provided new pane identity. Invalid mutation receipt explicitly warns that a window may exist, rather than claiming no effect.

## Implemented vs pending

Implemented: source rename and references; owner-aware fail-closed resolver; Herdr-over-tmux precedence; tmux side forks; introspection contributor protocol and session-tools policy/loadout/route snapshot. Existing Herdr subagent/navigation/messaging behavior retained behind route validation.

Pending: tmux subagent spawning/tracking/cancellation, backend-aware session navigation/focus/naming, control-channel messaging across tmux sessions, authorized Oqto-runner adapter and actual runner matrix proof. No arbitrary terminal keystroke messaging. Zellij intentionally excluded. Foundation is not completion of the epic.

## Optional introspection protocol

Trusted extensions participate through Pi's shared event bus `pi:introspection:status:v1`, not an imported singleton registry. Consumers emit version/sessionId/signal/reply. Contributors synchronously reply with a value or promise; late registration is ignored. Collector admits at most16 replies, waits at most300ms, propagates caller abort, bounds each contribution to32 flat primitive fields and1000-character text, and isolates rejected/malformed snapshots. Async contributors honor signal and their session generation. Session-tools registers at session_start and unsubscribes at shutdown/replacement, avoiding a disposed captured context.

Snapshot fields are allowlisted policy/route values, never credential stores, prompts or transcripts. Other contributors must define their own safe fields; sanitation is not a generic secrets detector. Introspection remains usable with zero contributors, emits objects to codemode and shows contributions in ordinary output.

## Evidence

`bun test`: 335 pass before final documentation changes; includes routing matrix unit tests, contributor deadline/abort/late-reply tests and an isolated real tmux server test for quoted fork argv plus preserved focus. `npm run check`: passes (warnings remain). Genuine official Node24.14.1/Pi1 codemode probe passes, including an assertion that session-tools contributes a plain-owner snapshot in the real host. No live terminal panes are created by tests; tmux integration uses its own temporary server/socket and fake Pi executable.

Not evidence: no live deployment, no cross-account runner routing or physical fullscreen response latency measurement. Reconcile source main and coordinate collection pins/manifests with Oqto before integration.

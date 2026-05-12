---
name: pi-acpx
description: Delegate tasks to ACP-compatible coding agents (Claude Code, Codex, OpenClaw, etc.) via the pi-acpx extension. Use for async/background delegation, large research/audit tasks, and keeping the main context window clean.
---

# pi-acpx skill

Use this skill when work should be delegated to another coding agent through ACP/acpx.

## When to use

- Long-running web research
- Broad audits or parallelizable investigations
- Alternative implementation exploration
- Background async runs where the parent context should stay compact

## Tools provided by pi-acpx

- `AcpxDelegate`
  - Start delegated work
  - Supports sync (`wait: true`) and async (`wait: false`) modes
- `AcpxResult`
  - Check async run status and fetch final result
- `AcpxCancel`
  - Cancel running async delegation
- `AcpxAgents`
  - List available acpx agent targets on this machine
- `AcpxUsage`
  - Probe usage/quota state for `claude` or `codex` (tmux-based fallback)

## Recommended workflow

1. Check targets with `AcpxAgents`.
2. Start delegation with `AcpxDelegate`.
3. For long tasks, use `wait: false` and poll with `AcpxResult`.
4. Save/track outputs in `.pi/delegations/` and reference paths in responses.
5. Use `AcpxUsage` when user asks about remaining quota/budget.

## Subscription-aware routing policy

When users rely on Claude/Codex subscriptions, actively monitor and route by remaining budget windows:

- short-term: `5h`
- medium-term: `weekly`
- long-term: `monthly`

Use `AcpxUsage` regularly and route work to maximize overall remaining headroom across all providers.

Suggested policy:

- For urgent/interactive tasks: prefer provider with strongest `5h` remaining.
- For heavy background tasks: prefer provider with stronger `weekly/monthly` remaining.
- If any key window drops below ~15-20%, treat that provider as degraded for new heavy delegations.
- Record routing rationale briefly (example: "routed to codex due to low claude weekly budget").

## Safety and permissions

- Delegated agents still run inside the host environment constraints (sandbox/policy still applies).
- In new/untrusted directories, CLIs may show trust prompts (`trust_prompt_required`).
- If logged out, probes can report `not_logged_in`.

## Usage examples

### Async delegate

```json
{
  "agent": "claude",
  "prompt": "Audit auth flows and list top 10 risks with file references.",
  "wait": false,
  "mode": "oneshot"
}
```

Then poll:

```json
{ "runId": "<returned-run-id>" }
```

### Usage probe

```json
{
  "provider": "codex",
  "cwd": "/home/user/project"
}
```

## Status semantics for usage probe

- `ok`
- `cli_missing`
- `tmux_missing`
- `trust_prompt_required`
- `not_logged_in`
- `parse_failed`

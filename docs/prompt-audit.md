# Extension prompt audit

Snapshot: `11b1e23` plus the uncommitted tab-sync and sudo prompt cleanups.
The findings below describe that snapshot. The subsequently approved cleanup
ships in bundle 3.1.0; see the status section for implemented changes.

## Coverage and method

- Inspected 156 non-test TypeScript/JavaScript files across all 40 top-level
  `pi-*` extensions. Reviewed tool descriptions, parameter descriptions,
  snippets, guidelines, system-prompt additions and event-driven context.
- Compared extracted prompt metadata against the 40 matching installed copies:
  no differences. Also reviewed the installed-only Kompressor tool metadata
  and checked the two standalone host/guard extensions for prompt additions.
- A real isolated offline Pi catalog probe loaded all 40 repository extensions
  and reported 17 extension tools and 67 commands. `session_surgery` is
  conditionally registered for rewrite jobs, so its additional tool definition
  was reviewed from source rather than exercised in this ordinary session.
- Followed the OpenUI imported reference into its generated bundle and invoked
  its actual session-start/before-agent-start handlers with a synthetic enabled
  session to confirm the injected text. No model calls, privileged commands,
  real secrets or external services were used.
- Archived extensions, user-authored context documents, skills, provider model
  prompts and Pi's own built-in tool descriptions are outside this audit's
  active-extension scope. Auxiliary LLM instructions were distinguished from
  the main agent's permanent instructions.

## Findings

### 1. OpenUI imports conflicting, globally phrased instructions

Evidence: `pi-openui/index.ts:148` injects the reference exported from
`pi-openui/openui-vendor.js:20663`.

When explicitly enabled (it is off by default), the resulting section is
37,291 characters. The wrapper says to emit UI through the `openui` tool and
never print OpenUI Lang as chat text, but the imported reference says:

- "Your ENTIRE response must be valid openui-lang code"
- "When asked about data, generate realistic/plausible data"
- "never mention colours, fonts or styling"

These are global conversational instructions, not merely a tool-program
reference. The first directly conflicts with the wrapper. The latter two can
misdirect unrelated work or real-data answers. This is the highest-priority
cleanup candidate, not just surplus wording.

Recommendation: scope the reference to the tool's `program` argument, remove
global response/data/style directives, and make the long syntax/component
reference available on demand. Change the maintained profile source and rebuild
the bundle rather than hand-editing generated vendor code. Add an enabled-session
prompt test for the conflicting phrases and an off-session absence test.

### 2. SSH access description includes a backend roadmap

Evidence: `pi-ssh-key/index.ts:1212`:

> Proxy sessions fail closed until the grant backend supports cancellation and TTL.

The current proxy restriction matters; the future implementation explanation
does not belong in permanent tool metadata.

Recommendation: state the current limitation concisely (no new key grants in
proxy sessions), leaving backend rationale in its existing failure message/docs.
Retain human approval and separate approval/access expiry semantics.

### 3. Workflow description contains provenance and duplicate syntax reference

Evidence: `pi-durable-workflow/index.ts:317` ends with:

> This is a custom pi-durable-workflow extension, not a Pi builtin.

It also interpolates `INTERVAL_FORMAT_HINT`, which is already attached to the
`interval` parameter at line 56 and included in interval validation errors.

Recommendation: remove extension-versus-builtin provenance and keep interval
syntax at the parameter/error surface. Retain the important current fact that
review does not activate recurrence and that missing execution authority fails
closed.

### 4. kyz injects human-only command help into the agent prompt

Evidence: `pi-kyz/index.ts:364`:

> Use /kyz to list available secrets. Use /kyz-scope tag:NAME to filter by tag.

These are human-facing Pi commands, not model-callable operations. The same
section already supplies the currently available secret names.

Recommendation: keep available names, scope and safe environment-variable usage
in agent context; put human slash-command help in command descriptions/docs or
an actionable error. Do not remove secret-handling restrictions.

### 5. History search has a lower-priority verbosity candidate

Evidence: `pi-history-search/index.ts:528` describes reading a session file once,
index/tokenization internals and a multi-step usage example. Some defaults repeat
parameter descriptions. The guidelines at line 364 also permanently describe a
stale-index recovery path.

Recommendation: keep the Search-versus-Grep choice, source anchors, scope
semantics and incomplete-store warning. Move internal implementation explanation
and situational recovery details to docs/results; retain argument semantics in
the schema. This is a brevity improvement, not evidence of removed functionality.

## Deliberately retained

- `memory`'s `deprecate` action is a current operation, not a deprecated tool.
- Human approval, no-secret-entry and metadata-is-not-authority boundaries are
  current safety contracts, not migration prose.
- Fork ownership notices and changed subagent policy messages are conditional
  live-state information, not obsolete permanent guidance.
- The todo progress rule reflects the requested working behavior.
- No additional deprecated tool alias equivalent to the removed
  `remote_sudo_exec` was found in the inspected active prompt surfaces.

## Cleanup status (3.1.0)

- OpenUI now injects 405 characters of tool-scoped guidance. A read-only
  `openui_reference` tool pages the language/component reference on demand;
  both tools are inactive when OpenUI is off. The generated vendor bundle is
  unchanged: the maintained consumer adapter excludes global assistant policy
  and rejects unknown reference boundaries.
- SSH metadata states the current proxy restriction without backend plans.
- Workflow keeps interval syntax in its parameter schema/errors and approval
  restrictions in its description, without provenance or duplicate syntax help.
- kyz keeps safe environment-variable usage, names and active scope, without
  human-only slash-command instructions.
- History keeps source anchors, branch scopes and incomplete-store warnings;
  defaults stay in schemas, and stale-index troubleshooting stays in docs.
  Scope text no longer implies a per-call `excludeCurrentSession` argument.
- The maintained Kompressor extension source was also checked against its
  installed copy. Its tool metadata contains current capability/safety boundaries,
  not obsolete alias prose. No changes were made to its extraction prompts,
  complete-input policies or memory behavior.

`just test-prompts` covers the revised metadata, secret-name context,
OpenUI enable/disable state, bounded reference paging and global-policy exclusion.
The earlier sudo regression also excludes alias, compatibility and guard-escape-
hatch prose from permanent tool metadata.

Verification at `11b1e23` plus this working diff:

- `just test-prompts`: 100 passed, no failures.
- Offline native Pi 1.4.0 loaded all 40 repository extensions: 18 tools and 67
  commands. The conditional rewrite-job tool remains absent outside that job.
  Both OpenUI tools were inactive by default; native `/openui on` activated both
  from the updated installed copy. Paging is covered by the executor tests.
- Targeted production typechecking against installed Pi 1.4.0 declarations
  passed using TypeScript. Repository `just check` remains blocked by 175
  diagnostics against stale local Pi 0.74.0 dependencies (unchanged HEAD also
  reports 175). The new reference metadata uses the supported current API;
  local old-type diagnostics are not claimed to be a passing check.
- Full suite: 1000 passed, 1 skipped, 34 failed, 8 errors. Unchanged HEAD:
  990 passed, 1 skipped, the identical 34 named failures and 8 errors. The SSH
  picker loaded-key filtering failure was also reproduced independently on HEAD.
- Touched-source Biome checks and `git diff --check` passed; existing complexity
  warnings remain. No extraction-policy changes or model requests were needed.

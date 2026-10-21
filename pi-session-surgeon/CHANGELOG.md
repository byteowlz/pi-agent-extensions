# Changelog

## 0.1.0

- New `/surgeon`: stage a 0600 copy of the current session, prove a
  restriction-only `oqto-sandbox` overlay (`--overlay` + `--print-effective`,
  ADR 0070), run a dedicated Pi agent inside it, verify the result, review the
  diff and publish a new branch. The original session is never modified.
- The agent only gets `session_surgery` (list/show/replace/verify) plus
  read/grep: text-only replacement that preserves ids, parents, timestamps and
  tool blocks, with an atomic write and one `.bak`.
- Refuses to launch unsandboxed: no `oqto-sandbox` → fail closed. No Docker path
  (ADR 0070 does not cover Docker placement). On non-Linux backends the policy is
  compiled with `--dry-run` and the report gap is stated.
- Tests: JSONL parse/replace/verify/atomic, staging layout/permissions/overlay,
  effective-policy assertions (widening, missing denial, wrong workspace,
  readable home) and report-arg shape.

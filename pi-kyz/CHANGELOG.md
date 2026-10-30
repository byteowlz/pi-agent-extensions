# Changelog

## 3.1.0 (extension bundle)

- Remove human-only slash-command help from the agent's secret context. Keep
  available environment-variable names, active scope and secret-handling rules.
- Verify injected context using a synthetic kyz executable: no secret values,
  no human command instructions, and preserved names/scope/safety guidance.

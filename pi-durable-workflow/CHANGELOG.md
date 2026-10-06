# Changelog

## 2.9.0

- Expose accepted interval examples, bounds and elapsed-time semantics directly
  in the model-visible parameter schema and tool description.
- Add minutely/hourly/daily/weekly aliases; weekly means seven elapsed days.
  Unsupported formats return actionable hints rather than requiring source search.
- Regenerate the copied runtime from portable core 1.1.0. Approval, subagent
  restrictions and unavailable-executor failure gates are unchanged.
- Verify copied-extension schema discovery with the official native Pi 1 host.

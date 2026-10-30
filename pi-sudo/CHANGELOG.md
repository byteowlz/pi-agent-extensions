# Changelog

## 3.0.0

- Remove the deprecated `remote_sudo_exec` tool, its prompt description and
  guidance, and the unused `RemoteSudoExecInput` type. Call `sudo_exec` with
  `host` for remote elevation; local/remote execution and authorization are
  unchanged. Reload Pi to refresh the registered tools and prompt.
- Keep guard escape-hatch instructions in the guard error and README, not
  permanent system-prompt guidance. Test that compatibility and escape-hatch
  prose cannot reappear in tool prompt metadata.
- Add registration and local/remote failure-receipt regression tests.

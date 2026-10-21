# Changelog

## Unreleased

- Move `ssh-key`, `sudo`, `sudo-warn`, `sudo-crit`, `kompressor-rolling`, and `xlatch` indicators immediately after the context gauge in the stats/model row, without duplicating them on the extension-status row.
- Preserve manifest ordering, colors, published expiry text, inactive handling, and width-aware truncation; leave other statuses unchanged.
- Add grouping and narrow-width layout regression tests.

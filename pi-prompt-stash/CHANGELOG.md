# Changelog

## 1.0.0

- Human-only draft stash/park/pop with session, exact-cwd and global JSON sidecars.
- Ctrl+Alt+S opens the menu without replacing a draft; searchable multiselect,
  full preview, restore/append/confirmed replacement and deletion.
- Explicit recorded-user history browsing includes original pre-compaction and
  alternative-branch text, excluding assistant/tools/compaction summaries.
- Promote selected text to scoped p- commands that fill the editor without
  submitting or generating executable code; per-command editing and overwrite review.
- Atomic private stores, cross-process fail-fast locks, bounded reads and input
  validation; no silent malformed-store replacement. Session/lifecycle fences.
- Text only; historical attachments require omission confirmation; independently
  attached images and cursor position are not archived. No provider/model tools.

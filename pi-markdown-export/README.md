# pi-markdown-export

Export the current Pi session to a Markdown file.

## Command

- `/export-md` → writes `pi-session-<timestamp>.md` in the current working directory
- `/export-md notes.md` → writes to `<cwd>/notes.md`
- `/export-md /absolute/path/notes.md` → writes to an absolute path

## Output format

- Session title as H1
- Export timestamp
- Message blocks grouped by role (`User`, `Assistant`, `System`)

# 003. JSON Lines Format for Output Storage

Date: 2025-12-25

## Status

Accepted

## Context

The indexer outputs a list of ChatGPT projects with metadata (name, URL, timestamps). We needed a storage format that:
- Supports incremental writes (projects are discovered one by one during scrolling)
- Is human-readable for debugging
- Allows easy append operations without rewriting the entire file
- Works well with standard Unix tools (grep, jq, etc.)

## Decision

We chose JSON Lines (JSONL) format for output storage, where each line is a valid JSON object representing one project.

Example output:
```json
{"name": "My Project", "url": "https://chatgpt.com/g/...", "capturedAt": "2025-12-25T..."}
{"name": "Another Project", "url": "https://chatgpt.com/g/...", "capturedAt": "2025-12-25T..."}
```

## Consequences

### Positive

- Append-friendly: new projects are appended without reading/rewriting entire file
- Streaming-friendly: can process large outputs line by line
- Crash-resilient: partial writes don't corrupt previous data
- Unix-friendly: `wc -l`, `grep`, `jq` work naturally
- Human-readable and editable

### Negative

- Not directly importable as a JSON array (need preprocessing for some tools)
- Each line must be self-contained (no pretty-printing within records)
- Slightly larger than compressed formats

## Alternatives Considered

1. **JSON Array**: Requires loading entire file to append; risk of corruption on crash
2. **SQLite**: Overkill for simple key-value data; adds dependency
3. **CSV**: Poor support for nested data; escaping issues with titles containing commas

## Related

- Planning: `.plan/.done/feat-mvp-chatgpt-project-indexer/`

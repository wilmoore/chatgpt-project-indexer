# 015. Remove Pin/Touch Functionality

Date: 2026-01-19

## Status

Accepted (supersedes ADR-009 and ADR-012)

## Context

The project previously implemented a "pin and touch" system that allowed:
1. Pinning projects to be periodically "touched" (visited in browser)
2. A queue-based API for scheduling touches via Supabase
3. Icon color detection and preservation during touch operations

After real-world usage, several issues became apparent:
- The touch mechanism was unreliable and frequently failed silently
- ChatGPT's DOM structure changed frequently, breaking the touch selectors
- The complexity added significant maintenance burden
- Users found it easier to manually touch projects directly in ChatGPT's UI

## Decision

Remove all pin/touch functionality from the codebase:
1. Delete the `src/touch/` directory entirely
2. Remove pin commands from CLI (`pin add`, `pin remove`, `pin list`)
3. Remove touch command from CLI
4. Remove `pinned`, `pinnedAt`, `iconColor`, `iconEmoji` fields from `ProjectRecord`
5. Remove touch queue processing from the orchestrator
6. Remove `TOUCH_QUEUE` configuration

## Consequences

### Positive
- Simplified codebase with fewer moving parts
- Reduced maintenance burden
- Fewer failure modes in watch mode
- Clearer scope: the tool now focuses purely on indexing/enumeration

### Negative
- Users who relied on automated touching must now touch projects manually
- Loss of icon metadata preservation (was used for touch restoration)

### Migration
- Existing data with `pinned`, `pinnedAt`, `iconColor`, `iconEmoji` fields will be ignored
- No database migration required; fields simply won't be populated

## Alternatives Considered

1. **Fix the touch mechanism**: Rejected because ChatGPT's DOM changes frequently, making this a maintenance burden with diminishing returns.

2. **Make touch optional via feature flag**: Rejected because unused code still adds complexity and testing overhead.

## Related

- Supersedes: ADR-009 (Invisible Touch for Project Pinning)
- Supersedes: ADR-012 (Queue-Based Touch API)
- Planning: `.plan/.done/feat-add-verbose-debug-mode/`

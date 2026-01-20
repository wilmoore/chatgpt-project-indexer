# Feature: Add Verbose Debug Mode

## Branch
`feat/add-verbose-debug-mode`

## Background

The codebase already has a structured logging system in `src/utils/logger.ts` with support for DEBUG, INFO, WARN, and ERROR levels. The `-v, --verbose` flag is already defined in `src/index.ts` (line 27-32) and correctly sets the log level to DEBUG when used.

**Current State:**
- Logger supports DEBUG level that is hidden by default (INFO is the default)
- The `-v` flag exists and calls `setLogLevel('DEBUG')`
- However, many operations don't use DEBUG logging - they either:
  1. Use `console.log` directly (bypassing the logger)
  2. Use `onProgress` callbacks that always output regardless of log level
  3. Suppress output entirely by passing `() => {}` as the progress callback in watch mode

## Problem Statement

From user logs:
```
2026-01-19T22:46:02.763Z [INFO] Starting watch mode (interval: 1m)
2026-01-19T22:46:02.765Z [INFO] Notifications enabled: macOS
Storage: Supabase backend enabled
Supabase: Loaded 485 existing projects
2026-01-19T22:46:20.588Z [INFO] Loaded 491 existing projects from storage
2026-01-19T22:46:20.589Z [INFO] Using existing session - launching in headless mode
Supabase: Started run 3b407223-620c-43a2-bc69-8e0f98c66ed1
```

After "Started run..." there's no output showing what the indexer is doing:
- No visibility into scrolling progress
- No visibility into project extraction
- No visibility into selector attempts
- No visibility into timing between operations

The user wants a verbose mode that shows more detail during active iteration/development.

## Requirements

1. When `-v/--verbose` flag is used, show detailed progress including:
   - Scrolling operations (scroll attempts, items found per scroll)
   - Project extraction progress (each project as it's processed)
   - Navigation steps (sidebar detection, popup opening)
   - Timing information for operations
   - Selector attempts (which selectors are being tried)

2. The verbose output should:
   - Use the existing DEBUG log level infrastructure
   - Be timestamp-prefixed for correlation
   - Not be shown during normal (non-verbose) operation
   - Work in both single-run and watch modes

## ADR Review

Reviewed ADRs - no conflicts:
- ADR-007 (Watch Mode) - compatible, watch mode already uses logger
- ADR-014 (Pluggable Notification System) - unrelated

## Design

### Approach: Enhance existing logger usage

Rather than creating a new logging mechanism, leverage the existing logger infrastructure:

1. **Add `logger.debug()` calls to key operations:**
   - `src/scraper/orchestrator.ts` - watch mode internals
   - `src/scraper/scroller.ts` - scroll iterations, stability checks
   - `src/scraper/extractor.ts` - per-project extraction details
   - `src/scraper/navigator.ts` - selector attempts, popup detection
   - `src/storage/supabase.ts` - database operations
   - `src/browser/manager.ts` - browser launch details

2. **Replace silent callbacks in watch mode:**
   - Currently `runSingleScan()` passes `() => {}` as progress callbacks
   - Change to conditionally use `logger.debug()` when verbose

3. **Add timing logs for expensive operations:**
   - Scroll operations
   - Network requests (Supabase operations)
   - Browser navigation

### Files to Modify

1. `src/scraper/orchestrator.ts`
   - Add debug logging for scan lifecycle
   - Replace silent callbacks with debug-aware callbacks

2. `src/scraper/scroller.ts`
   - Add debug logging for each scroll iteration
   - Log stability threshold progress

3. `src/scraper/extractor.ts`
   - Add debug logging for extraction attempts
   - Log selector matches

4. `src/scraper/navigator.ts`
   - Add debug logging for element finding
   - Log popup detection attempts

5. `src/storage/supabase.ts`
   - Replace `console.log` with structured logger calls
   - Add debug logging for batch operations

6. `src/browser/manager.ts`
   - Add debug logging for browser launch steps

## Implementation Steps

1. [ ] Update `src/scraper/orchestrator.ts`:
   - Import logger
   - Add debug logs for scan phases
   - Create debug-aware progress callback for watch mode

2. [ ] Update `src/scraper/scroller.ts`:
   - Import logger
   - Add debug logs for scroll iterations
   - Log stability threshold tracking

3. [ ] Update `src/scraper/extractor.ts`:
   - Import logger
   - Add debug logs for each extraction
   - Log selector attempts

4. [ ] Update `src/scraper/navigator.ts`:
   - Import logger
   - Add debug logs for element finding
   - Log selector chain attempts

5. [ ] Update `src/storage/supabase.ts`:
   - Replace console.log with logger.info/debug
   - Add timing logs for operations

6. [ ] Update `src/browser/manager.ts`:
   - Replace console.log with logger
   - Add debug logs for launch steps

7. [ ] Test verbose mode:
   - Run with `-v` flag
   - Verify detailed output appears
   - Verify output suppressed without flag

## Out of Scope

- Adding new CLI flags (already have `-v`)
- Changing log format
- Adding log file output
- Log rotation
- Per-module log levels

## Definition of Done

- [ ] Running `npm run dev:watch -- -v` shows detailed progress
- [ ] Running `npm run dev:watch` (without -v) shows minimal output as before
- [ ] All `console.log` calls in modified files replaced with structured logger
- [ ] Build passes (`npm run build`)
- [ ] Lint passes (`npm run lint`)
- [ ] Type check passes (`npm run typecheck`)

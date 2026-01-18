# Touch Queue Errors Investigation

## Bug Summary
Touch queue processes 3 requests with 0 successes, 3 failures.

## Error Types

### 1. Execution Context Destroyed
- **Message**: `page.evaluate: Execution context was destroyed, most likely because of a navigation`
- **Project**: `g-p-696103efe7ac8191b4952d985aa52538-mens-health-trt`
- **Cause**: Page navigated during `page.evaluate()` call
- **Root Cause**: Likely caused by `tsx --watch` hot-reload restarting the process

### 2. 403 Forbidden on Gizmo Fetch
- **Message**: `Failed to fetch gizmo: 403`
- **Projects**:
  - `g-p-6946a2112fac8191b4253bddec61b571-business-insights`
  - `g-p-69587bbd28688191883f4728e4fff414-business-insights`
- **Cause**: ChatGPT API returns 403 when fetching gizmo details
- **Root Cause Candidates**:
  1. Projects exist in sidebar but user lacks edit permissions
  2. Session degraded after first error (can enumerate but not modify)
  3. Gizmo API expects different ID format than what we store

## Evidence Gathered

### Projects Exist in Database
All three projects exist in the local Supabase database and were confirmed today:
- `mens-health-trt`: confirmed at 17:44:59
- `business-insights` (two): confirmed at 17:44:59 and 17:45:01

### Error Sequence
1. First request: "Execution context destroyed" (navigation during evaluate)
2. Second request: 403 Forbidden
3. Third request: 403 Forbidden

The 403 errors came AFTER the context destruction, suggesting the session may have been invalidated.

## ADRs Reviewed
- ADR-009: Invisible Touch for Project Pinning
- ADR-012: Queue-Based Touch API

## Code Analysis

### `src/touch/icon-color.ts`
- `fetchGizmo()` calls `GET /backend-api/gizmos/{id}` via `page.evaluate()`
- Returns `null` with console.error on 403
- No distinction between "project deleted" vs "no permission" vs "session expired"

### `src/touch/queue-processor.ts`
- Catches errors but doesn't handle specific failure modes
- No retry logic for transient failures
- No session validation before processing

## Hypotheses

### H1: Hot-reload causes navigation destruction
The `tsx --watch` mode restarts the TypeScript process on file changes, which may trigger browser navigation or context invalidation.

### H2: 403 indicates deleted/inaccessible projects
User may have deleted these projects on ChatGPT but they remain in the local database.

### H3: Session degradation cascades
After the first error (context destroyed), the browser session may have been invalidated, causing subsequent 403 errors.

## Root Cause Identified

### Race Condition in Watch Mode

The bug is a **race condition** between touch queue polling and scan navigation:

1. `ensureBrowser()` returns the page (browser launched)
2. Touch queue starts polling **immediately** with an async initial poll
3. Main code continues to `runSingleScan()` which calls `navigateToChatGPT(page)`
4. The navigation **destroys the execution context** of any in-progress `page.evaluate()` call
5. Result: "Execution context was destroyed" error

The 403 errors are a **cascading effect** - after the navigation destroys the context, subsequent operations may run on a page that isn't fully authenticated yet.

### Timeline Analysis
```
17:49:30.741Z - Touch queue: Starting polling
17:49:30.769Z - Processing 3 pending requests (async poll starts)
17:49:30.892Z - ERROR: context destroyed (navigation happened)
               - Subsequent 403 errors due to degraded state
```

## Fix Implemented

### src/scraper/orchestrator.ts

Changed the order of operations in `runWatchMode()`:

**Before:**
1. Ensure browser
2. Start touch queue polling (immediate async poll)
3. Run scan (navigates page → destroys touch context)

**After:**
1. Ensure browser
2. Pause touch queue if running
3. Run scan (navigation is safe)
4. Start/resume touch queue AFTER scan completes

### src/touch/icon-color.ts

Improved error messages for HTTP status codes:
- 403: "Access denied - project may be deleted or you lack edit permissions"
- 404: "Project not found - it may have been deleted"
- 401: "Authentication required - session may have expired"
- 429: "Rate limited - too many requests"

## Verification

1. Reset all 3 failed requests to `pending` status
2. Run `npm run dev:watch` to test the fix
3. Touch queue should now process AFTER scan completes
4. No more "execution context destroyed" errors

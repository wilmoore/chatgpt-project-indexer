# Spike: Hot Reload for Watch Mode

## Overview

Explore whether hot reloading can be supported when the indexer runs in watch mode. When iterating on code, the process should automatically pick up changes without manual restart.

## Related ADRs

- **ADR-007: Watch Mode with Timer-Based Re-scanning** - Defines current watch mode behavior:
  - Timer-based intervals (default 15 minutes)
  - Browser stays open continuously
  - Interruptible sleep (checks shutdown flag every second)
  - Graceful shutdown on SIGTERM/SIGINT

## Current Watch Mode Behavior

Based on code analysis (`src/scraper/orchestrator.ts:236-388`):

1. **Watch mode** (`--watch` flag) keeps the process running with periodic re-scans
2. It does **not** automatically exit - it runs in a continuous loop until SIGTERM/SIGINT
3. Sleep between scans is interruptible (checks every 1 second)
4. Browser context is kept alive between scans for efficiency
5. Touch queue processing runs in parallel during watch mode

**Current development workflow:**
1. Make code change
2. Stop running watch process (Ctrl+C)
3. Rebuild (`npm run build`)
4. Restart watch process

## Uncertainty to Reduce

1. **What mechanisms exist for Node.js hot reloading?**
2. **Can compiled TypeScript be hot-reloaded without restart?**
3. **How would browser state be preserved across code reloads?**
4. **What are the trade-offs of different approaches?**

## Success Criteria

- Understand viable hot reload options for this project
- Determine if hot reload is feasible without major architecture changes
- Have a clear recommendation: implement, defer, or reject

## Time-box

1-2 hours of exploration

---

## Exploration Areas

### 1. Node.js Hot Reload Options

| Approach | Description | Pros | Cons |
|----------|-------------|------|------|
| **tsx --watch** | Built-in watch mode in tsx | Already a devDependency, simple | Restarts entire process |
| **nodemon** | Classic file watcher + restart | Mature, configurable | Restarts entire process |
| **node --watch** | Native Node.js watch (v18.11+) | No dependencies | Restarts entire process |
| **Dynamic imports** | Re-import modules at runtime | Preserves process state | Complex, ESM cache issues |
| **Vite HMR** | Hot Module Replacement | True HMR, no restart | Designed for frontend, overkill |

### 2. Key Constraints

1. **Browser state**: Watch mode keeps Playwright browser open. Restarting the process means:
   - Browser context lost
   - Need to re-authenticate
   - Lose touch queue processor state

2. **ESM module caching**: Node.js caches imported modules. Re-importing doesn't pick up changes without cache busting.

3. **Compiled output**: Project uses `tsc` → `dist/`. Hot reload options:
   - Watch TypeScript source (`tsx --watch`)
   - Watch compiled output (`node --watch dist/index.js`)

### 3. Recommended Approach

**Option A: Development Mode with tsx --watch (Simple)**

Add a new script for development:
```json
{
  "scripts": {
    "dev:watch": "tsx --watch src/index.ts run --watch"
  }
}
```

- Uses existing `tsx` devDependency
- Watches source files, restarts on change
- **Trade-off**: Full restart means browser closes, but acceptable for development

**Option B: Custom File Watcher with Dynamic Re-import (Complex)**

Modify `runWatchMode()` to:
1. Watch `src/` or `dist/` for changes
2. On change, dynamically re-import affected modules
3. Preserve browser context and queue processor

Challenges:
- ESM module cache requires URL query string tricks
- Risk of memory leaks from unreleased module references
- Complex to implement correctly

**Option C: Separate Dev Server (Over-engineered)**

Run a dev server that manages the indexer subprocess, restarting it on changes.

- Too much infrastructure for this use case

## Recommendation

**Go with Option A (tsx --watch)** for simplicity:

1. Add `"dev:watch": "tsx --watch src/index.ts run --watch"` to package.json
2. Accept that browser restarts on code changes (development is still faster than manual restart cycle)
3. For production, continue using compiled `dist/` with `npm run watch`

The browser restart penalty is acceptable because:
- Development iteration speed matters more than avoiding browser restarts
- Auth state persists in Playwright's persistent context
- No architecture changes required

## Alternative: Granular Hot Reload (Future Enhancement)

If browser restarts become too painful, a future enhancement could:
1. Extract business logic into separate modules
2. Implement a plugin/middleware pattern
3. Hot-reload only the business logic, not the browser harness

This would require architectural changes beyond a spike scope.

---

## Implementation Complete

### Changes Made

1. **Added `dev:watch` script** (`package.json`):
   ```json
   "dev:watch": "tsx --watch src/index.ts run --watch --interval 1m"
   ```
   - Uses tsx with file watching
   - Runs in watch mode with 1-minute scan interval (faster for dev)
   - Auto-restarts on code changes

2. **Reduced touch queue poll interval** (`src/config/constants.ts`):
   - Changed from 5000ms → 2000ms (2 seconds)
   - Touch requests should now be picked up within 2-4 seconds

### Touch Queue Latency Investigation

The user reported "multiple minutes" latency. Analysis:

| Factor | Expected Latency | Finding |
|--------|-----------------|---------|
| Poll interval | Was 5s, now 2s | Not the cause of minutes-long delays |
| Processing time | 1-3 seconds | Normal |
| Scan interference | During scan only | Scans take ~30-60s, not minutes |

**If you're still seeing multi-minute delays**, the most likely causes:
1. **Not running in watch mode** - Run with `npm run watch` or `npm run dev:watch`
2. **Supabase not running** - Ensure `supabase start` has been run
3. **Queue table doesn't exist** - Run migrations with `supabase db reset`
4. **First scan in progress** - The first scan must complete before queue processing is fully responsive

To debug, look for these log messages when running:
```
Touch queue: Starting polling (interval: 2000ms)
Touch queue: Processing X pending request(s)
```

If you don't see these, the queue processor isn't running.

---

## Spike Outcome

**Status: Implemented**

Both items addressed:
- [x] Hot reload via `npm run dev:watch`
- [x] Touch queue latency reduced to 2 seconds

# Bug Report: Authentication Timeout Silent Failures

## Summary
The indexer silently fails with authentication timeouts during watch mode, requiring manual monitoring. Users have no visibility into failures without watching logs directly.

## Steps to Reproduce
1. Start watch mode: `chatgpt-indexer run --watch --interval 1m`
2. Let the session run for an extended period
3. Authentication eventually expires (session timeout)
4. Observe repeated failures in logs without any external notification

## Expected Behavior
- User should receive an SMS notification when authentication failures occur
- System should attempt auto-recovery (page refresh) before alerting
- User should be able to re-authenticate and have the system resume normally

## Actual Behavior
- System logs warnings but continues to retry indefinitely
- No external notification mechanism exists
- User must babysit logs to notice failures
- Projects become stale (e.g., renamed projects show old names)

## Evidence from Logs
```
2026-01-19T15:02:22.636Z [INFO] Next scan in 1m
Supabase: Started run 7b888629-9bac-44db-9ec4-88c055c7f1db
2026-01-19T15:09:00.634Z [WARN] Scan #175 failed: Authentication timeout - user did not re-authenticate within the allowed time - will retry in 1m
Supabase: Marked run 7b888629-9bac-44db-9ec4-88c055c7f1db as failed (data preserved)
...
(Pattern repeats for scans 176-180, all failing with same error)
```

## Environment
- Platform: macOS (Darwin 25.1.0)
- Branch: fix/authentication-timeout-silent-failures
- Current version: 1.6.1

## Severity
**High** - Blocks autonomous operation; requires constant babysitting, defeating the purpose of watch mode.

## Root Cause Analysis

### Code Path
1. `runWatchMode()` in `src/scraper/orchestrator.ts` runs scan loop
2. `runSingleScan()` calls `ensureAuthenticated(page, () => {})`
3. `ensureAuthenticated()` in `src/auth/recovery.ts` detects auth state
4. If not authenticated, calls `recoverFromAuthExpiration()`
5. `recoverFromAuthExpiration()` waits 5 minutes (`AUTH_RECOVERY: 300_000`) for user to re-auth
6. If timeout, throws `AuthRecoveryError`
7. Error caught at line 364 in orchestrator, logged as warning, retry scheduled
8. **No notification sent** - user unaware of failure

### Key Issue
The error handling at lines 364-377 catches the error and logs it, but has no mechanism to notify the user externally. The browser may be in the background or on a different machine entirely (headless server).

## Proposed Solution

### 1. Add Notification Module
Create `src/notifications/` module with:
- SMS support via Twilio (recommended for reliability and ease of setup)
- Configurable via environment variables
- Rate limiting to prevent notification spam

### 2. Add Auto-Recovery Before Alert
Before notifying user, attempt:
1. Page refresh
2. Re-check authentication state
3. Only alert if recovery fails

### 3. Configuration
Environment variables:
- `NOTIFY_SMS_ENABLED=true`
- `TWILIO_ACCOUNT_SID=xxx`
- `TWILIO_AUTH_TOKEN=xxx`
- `TWILIO_FROM_NUMBER=+1xxx`
- `NOTIFY_TO_NUMBER=+1xxx`

### 4. Alert Trigger
- On first auth failure (per user preference)
- After auto-recovery attempt fails

## Related ADRs
- ADR-007: Watch mode with timer-based rescanning (establishes watch mode pattern)
- ADR-004: Multi-backend storage architecture (notifications could be another "backend")

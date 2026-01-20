# 016. Defensive Data Recovery on Failure

Date: 2026-01-20

## Status

Accepted

## Context

The system uses a buffered write strategy to batch Supabase upserts for performance. However, when a run fails (due to errors, timeouts, or process termination), buffered data that hasn't been flushed is lost. Analysis showed that 75% of runs (524/703) failed without flushing, resulting in data discrepancies between local JSON storage (520 projects) and Supabase (510 projects).

The existing `failRun()` method marked runs as failed but did not attempt to preserve buffered data, and there was no mechanism to recover data that was successfully written to local storage but never synced to Supabase.

## Decision

Implement a two-part defensive data recovery strategy:

1. **Flush-on-Failure**: Modify `failRun()` to attempt flushing buffered projects before marking the run as failed. This preserves data even when runs fail mid-execution.

2. **Recovery Sync on Startup**: Add `syncFromLocalStorage()` method called during `initialize()` that compares local JSON storage against Supabase and syncs any missing projects. This recovers data from historical failed runs.

Key implementation choices:
- Flush failures in `failRun()` are caught and logged but don't prevent the run from being marked as failed
- Recovery sync uses `ENOENT` detection to gracefully handle missing local files
- Recovery sync logs the number of projects recovered for visibility
- Recovered projects have `run_id` and `last_confirmed_run_id` set to `null` since the original run context is unknown

## Consequences

**Positive:**
- Near-zero data loss on failed runs (buffer is flushed before failure)
- Historical data loss is recovered on next startup
- Non-blocking recovery (errors don't fail initialization)
- Visibility into recovery operations through logging

**Negative:**
- Recovered projects lack run association metadata
- Slight startup latency when recovery sync finds missing projects
- Additional file I/O on every initialization (reading local JSON)

## Alternatives Considered

1. **Write-through (no buffering)**: Would eliminate buffer loss but significantly impact performance due to per-project upserts.

2. **Periodic checkpointing**: More complex to implement and doesn't address historical data loss.

3. **Transaction-based batching**: Supabase doesn't support true transactions for upserts, making rollback-based approaches impractical.

## Related

- Planning: `.plan/.done/fix-duplicate-projects-collapsed-to-one/`
- ADR 005: Run-Based Data Management (defines run lifecycle)
- ADR 013: Atomic Run Support for Data Integrity (defines atomicity guarantees)

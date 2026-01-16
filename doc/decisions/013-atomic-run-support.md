# 013. Atomic Run Support for Data Integrity

Date: 2026-01-16

## Status

Accepted

## Context

A critical bug was discovered where failed enumeration runs could result in an empty projects table. The issue stemmed from a race condition in the data management logic:

1. Projects were upserted with the current `run_id` during scanning
2. After run completion, cleanup deleted projects with old `run_id` values
3. If the flush (upsert) failed but the run was still marked complete, the cleanup would delete all existing projects

This violated the core requirement: "We should never lose projects from one run to the next."

## Decision

Implement atomic run support with explicit flush tracking:

1. **Flush Success Tracking**: Add a `flushSucceeded` flag that tracks whether the upsert operation actually succeeded

2. **Last Confirmed Run ID**: Add `last_confirmed_run_id` column to projects table, only updated on successful flush

3. **Run State Table**: New `run_state` table tracks run status (`active`, `completed`, `failed`) with project counts

4. **Safe Cleanup**: The `safe_cleanup_old_projects` function only removes data after verifying the flush succeeded

5. **Fail-Safe Completion**: If flush failed, `completeRun()` marks the run as failed instead of completed, preserving existing data

## Consequences

### Positive
- Data integrity guaranteed: failed flushes never cause data loss
- Explicit state tracking makes debugging easier
- Run history preserved for audit purposes
- Safe to retry failed runs without data corruption

### Negative
- Additional database complexity (new table, new column)
- Slightly more storage for run tracking
- Code must explicitly call flush before completion

## Alternatives Considered

### 1. Transaction-Based Approach
Wrap all operations in a database transaction.

**Rejected because:** The scanning process takes several minutes. Long-running transactions are problematic for connection management and don't work well with incremental progress updates.

### 2. Shadow Table Pattern
Write to a shadow table, then swap tables atomically.

**Rejected because:** Adds significant complexity. The project count can be hundreds of records - full table swaps are overkill. The run-based approach with explicit tracking is simpler.

### 3. Optimistic Concurrency
Use version numbers and retry on conflict.

**Rejected because:** The problem wasn't concurrent writes but incomplete state tracking. The flush success flag directly addresses the root cause.

## Related

- ADR 005: Run-Based Data Management
- Planning: `.plan/.done/feat-touch-api-and-docs/`

# 005. Run-Based Data Management

Date: 2025-12-30

## Status

Accepted

## Context

After fixing the title extraction bug, the Supabase database contained mixed data:
- Old records with lowercase slug-derived titles (from Dec 26 run)
- New records with proper-cased titles (from current run)

We needed a strategy to manage stale data between enumeration runs. The challenge: How to clean up old data without risking data loss if a run fails mid-execution.

## Decision

Implement run-based data management with batch IDs:

1. Each enumeration run creates a new record in the `runs` table with `status: 'running'`
2. All extracted projects are tagged with the current `run_id`
3. On successful completion, the run is marked `completed` with statistics
4. Old runs beyond `KEEP_RUNS` (default: 3) are deleted along with their associated projects
5. If a run fails, it's marked `failed` and data is preserved for debugging

Database schema:
```sql
CREATE TABLE runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  status TEXT CHECK (status IN ('running', 'completed', 'failed')),
  projects_found INTEGER,
  projects_extracted INTEGER
);

ALTER TABLE projects ADD COLUMN run_id UUID REFERENCES runs(id);
```

## Consequences

### Positive

- No data loss risk: cleanup only happens after successful run
- Audit trail: can see when each project was confirmed
- Rollback capability: failed runs preserve data for debugging
- Clean data: old stale records automatically cleaned up
- Configurable retention via `KEEP_RUNS`

### Negative

- More complex database schema
- Need to track run lifecycle in code
- Potential for orphaned data if cleanup fails

## Alternatives Considered

### 1. Truncate before each run

Rejected because:
- If run fails, database is empty
- No rollback capability
- Data loss risk too high

### 2. Soft delete with `missing_since` timestamp

Rejected because:
- More complex queries
- Doesn't clean up disk space automatically
- Harder to reason about "current" data

### 3. Two-table swap (active/staging)

Rejected because:
- Significantly more complex
- Overkill for this use case
- Harder to implement atomically

## Related

- Planning: `.plan/.done/fix-project-title-extraction-from-popup/`
- Files: `src/storage/supabase.ts`, `supabase/migrations/20251230142808_add_run_tracking.sql`

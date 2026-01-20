# Bug Investigation: Projects Missing from Supabase

## Initial Report
User reported two "Business :: Insights" projects visible in ChatGPT sidebar, but only one appears in Supabase database. The other is being "collapsed" or "left out".

## Investigation Steps

### 1. Verified Local JSON
Both projects exist in `projects.json`:
- `g-p-6946a2112fac8191b4253bddec61b571-business-insights`
- `g-p-69587bbd28688191883f4728e4fff414-business-insights`

### 2. Queried Supabase Database
Only ONE "Business :: Insights" was in the database before manual intervention.

### 3. Tested Database Constraints
- No unique constraint on `title` column
- Direct insert of missing project SUCCEEDED - no database issue

### 4. Compared Counts
- Local JSON: 520 projects
- Supabase: 509 projects (510 after manual insert)
- **11 projects missing from Supabase**

### 5. Analyzed Missing Projects
All 11 missing projects:
- Exist in local JSON with valid data
- Have `lastConfirmedAt` timestamps that don't align with any successful run
- Several have non-ASCII characters (Ś) but that's not the cause (some without special chars also missing)

### 6. Checked Run History
- **703 total runs**
- **524 FAILED runs** (75% failure rate!)
- **24 stuck "running" runs**

## Root Cause

**Failed runs don't sync the Supabase buffer before marking as failed.**

The workflow is:
1. Run starts, `startRun()` called
2. Extraction begins, projects added to both backends via `addProjectToAll()`
3. Local JSON writer: immediately schedules flush (5s interval)
4. Supabase writer: buffers projects, schedules flush (5s interval)
5. **If run fails before flush interval** (auth timeout, browser crash, network error):
   - Local JSON may have flushed (incremental writes)
   - Supabase buffer is LOST (never flushed)
6. `failRun()` is called, which marks run as failed but doesn't flush buffer

## Evidence
- Missing projects have `lastConfirmedAt` timestamps that don't match any completed run
- Example: Projects last confirmed at 12:32, but nearest completed run is at 12:33
- This indicates extraction happened but the run failed before Supabase flush

## Solution Options

### Option A: Recovery Sync on Startup (Recommended)
On initialization, compare local JSON projects to Supabase and sync any missing ones.
- Pros: Handles past failures, future failures, any sync gaps
- Cons: Adds startup time

### Option B: Flush on Failure
Modify `failRun()` to flush the buffer before marking as failed.
- Pros: Prevents future data loss
- Cons: Doesn't recover past losses

### Option C: More Frequent Flushes
Reduce flush interval from 5s to 1s, or flush after each project.
- Pros: Reduces window for data loss
- Cons: More API calls, doesn't guarantee no loss

### Recommended: Implement Option A + Option B
1. Add recovery sync on Supabase initialization
2. Flush buffer in `failRun()` before marking failed

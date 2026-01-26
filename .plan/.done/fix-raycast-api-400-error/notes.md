# Bug Fix: Raycast API 400 Error

## Summary

Raycast extension getting 400 errors when fetching projects. The API endpoint returns no data.

## Root Cause

1. **Schema change**: Migration `20260121000000_snapshot_based_runs.sql` changed the data model:
   - **Before**: Projects stored directly in `projects` table
   - **After**: Projects stored in `run_projects` table, exposed via `current_projects` view

2. **Edge functions not updated**: Both `/projects` and `/meta` edge functions still query the legacy `projects` table which is now empty.

3. **PostgREST requires API key**: The Raycast extension was using `/rest/v1/projects` which requires an anon key - poor UX for end users.

## Fix

1. Update `supabase/functions/projects/index.ts`:
   - Query `current_projects` view instead of `projects` table
   - Generate URL from project ID (`https://chatgpt.com/g/${id}`)

2. Update `supabase/functions/meta/index.ts`:
   - Query `current_projects` view instead of `projects` table

3. Raycast extension should use `/functions/v1/projects` endpoint (no API key required)

## Files Changed

- `supabase/functions/projects/index.ts`
- `supabase/functions/meta/index.ts`

## Related ADRs

- ADR-005: Run-Based Data Management
- ADR-008: Supabase Edge Functions for API Access

## Verification

1. Deploy edge functions: `supabase functions deploy`
2. Test `/functions/v1/projects` endpoint returns project list
3. Test `/functions/v1/meta` endpoint returns correct count
4. Update Raycast extension to use edge function URL

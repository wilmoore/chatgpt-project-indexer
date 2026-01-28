# Fix: Edge Function 401 Unauthorized

## Bug

- **Error:** `HTTP 401: Unauthorized` when Raycast extension calls Supabase edge functions
- **Severity:** Blocks work (extension completely non-functional)
- **Branch:** `fix/edge-function-401-unauthorized`

## Root Cause

Supabase edge functions default to JWT verification enabled. Without a `config.toml` specifying `verify_jwt = false`, the Supabase gateway rejects requests that lack an `Authorization` header.

The Raycast extension sends no auth headers (only `Accept: application/json`) because these are public read-only endpoints per ADR-008.

## Evidence

- All three endpoints (`/functions/v1/projects`, `/functions/v1/meta`, `/functions/v1/docs`) returned HTTP 401 before fix
- `fetchEdgeFunctionProjects()` in the Raycast extension sends no `Authorization` header
- Edge function code has no JWT validation logic -- relies on gateway setting

## Fix Applied

1. Created `supabase/config.toml` via `supabase init`
2. Added per-function JWT verification disabled:
   ```toml
   [functions.projects]
   verify_jwt = false

   [functions.meta]
   verify_jwt = false

   [functions.docs]
   verify_jwt = false
   ```
3. Restarted local Supabase (`supabase stop && supabase start`)

## Verification

- `/functions/v1/projects` -- 200 with JSON array (532 projects)
- `/functions/v1/meta` -- 200 with `{"name":"ChatGPT Project Index","version":"1.0.0","project_count":532}`
- `/functions/v1/docs` -- 200 with OpenAPI spec JSON

## Regression Prevention

- `config.toml` is now version-controlled with explicit `verify_jwt = false` per function
- Added `npm run supabase:restart` script for applying config changes
- Future edge function additions must add a `[functions.<name>]` entry to `config.toml`

## Files Modified

- `supabase/config.toml` -- created with function JWT verification disabled
- `package.json` -- added `supabase:start`, `supabase:stop`, `supabase:restart` scripts

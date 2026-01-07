# 008. Supabase Edge Functions for API Access

Date: 2026-01-07

## Status

Accepted

## Context

The project index data is stored in Supabase, but there was no programmatic way for external tools or integrations to access this data. Users and developers needed a public API to:

- Query the list of indexed projects
- Get metadata about the index (project count, version)
- Enable browser-based clients to fetch data (requiring CORS support)

Options considered:
1. **Supabase Edge Functions** - Serverless functions with Deno runtime
2. **PostgREST direct access** - Use Supabase's auto-generated REST API
3. **External API service** - Deploy a separate API server

## Decision

Use Supabase Edge Functions to expose two endpoints:

- `/meta` - Returns service metadata and project count
- `/projects` - Returns the full list of indexed projects

Key implementation choices:
- **Service role key** for database access (not exposed to clients)
- **Full CORS support** for browser-based integrations
- **Field mapping** to present a clean API contract (e.g., `title` -> `name`)
- **JSR imports** for the Supabase client library

## Consequences

### Positive

- **Zero infrastructure** - Functions run on Supabase's edge network
- **Low latency** - Edge deployment close to users
- **Simple deployment** - `supabase functions deploy`
- **Integrated** - Same platform as database, no credential management
- **CORS built-in** - Handles preflight requests automatically

### Negative

- **Deno runtime** - Different from main project's Node.js toolchain
- **Cold starts** - First request may have slight delay
- **Vendor coupling** - Tied to Supabase's edge function platform

## Alternatives Considered

### PostgREST Direct Access

Rejected because:
- Exposes database schema directly
- Less control over response format
- Would require Row Level Security for public access

### External API Service

Rejected because:
- Additional infrastructure to manage
- Separate deployment pipeline
- More complex credential management

## Related

- Planning: `.plan/feat-supabase-edge-functions/`

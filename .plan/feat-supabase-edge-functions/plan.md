# Feature: Supabase Edge Functions

## Overview

Add public API endpoints for accessing the project index data via Supabase Edge Functions.

## Goals

- Provide programmatic access to indexed ChatGPT projects
- Enable external integrations and tooling to consume project data
- Support CORS for browser-based clients

## Implementation

### Edge Functions

1. **`meta`** - Returns metadata about the index
   - Project count
   - Service name and version

2. **`projects`** - Returns the list of indexed projects
   - Fields: id, name, open_url
   - Sorted alphabetically by title

### Technical Details

- Uses Supabase Edge Functions (Deno runtime)
- CORS headers enabled for cross-origin access
- Service role key for database access (server-side only)
- JSR imports for Supabase client

## Endpoints

| Function | Method | Response |
|----------|--------|----------|
| `/meta` | GET | `{ name, version, project_count }` |
| `/projects` | GET | `[{ id, name, open_url }, ...]` |

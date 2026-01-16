# Feature: Touch API and Documentation

## Summary

Expose the "touch" functionality via API so the Raycast extension can trigger touch operations to float projects to the top of the ChatGPT sidebar. Also add OpenAPI documentation for all API endpoints.

## Background

### Current State
- Raycast extension uses `http://127.0.0.1:54321/rest/v1/projects` (PostgREST)
- Touch functionality exists via CLI: `chatgpt-indexer touch`
- Touch requires browser session with ChatGPT auth (uses icon color flip)
- No API endpoint for triggering touch operations

### Related ADRs
- **ADR 008:** Supabase Edge Functions for API Access
- **ADR 009:** Invisible Touch for Project Pinning (icon color flip mechanism)
- **ADR 011:** Shared CORS Utility

## Requirements

### Functional
1. **Touch API** - Raycast can trigger touch for a specific project via REST
2. **Queue-based execution** - Async pattern (queue request → indexer processes)
3. **Status tracking** - Ability to check if touch completed
4. **API Documentation** - OpenAPI/Swagger spec + interactive docs

### Non-Functional
1. Touch executes within 5-10 seconds of request
2. Single service model (no additional processes for user to run)
3. Uses existing Supabase URL (same as project list)

## Architecture

### Queue-Based Touch via PostgREST

```
┌─────────────────────────────────────────────────────────────────┐
│                     Raycast Extension                           │
│  POST /rest/v1/touch_queue { "project_id": "g-p-abc123" }      │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Supabase (PostgREST)                       │
│                                                                 │
│  touch_queue table:                                             │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ id | project_id    | status    | created_at | touched_at│   │
│  │ 1  | g-p-abc123    | pending   | 2026-01-15 | null      │   │
│  │ 2  | g-p-xyz789    | completed | 2026-01-15 | 2026-01-15│   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ (polling every 5 seconds)
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                chatgpt-indexer run --watch                      │
│                                                                 │
│  TouchQueueProcessor:                                           │
│  1. SELECT * FROM touch_queue WHERE status = 'pending'          │
│  2. For each: execute touch via browser (icon color flip)       │
│  3. UPDATE touch_queue SET status = 'completed'                 │
└─────────────────────────────────────────────────────────────────┘
```

### API Endpoints (PostgREST)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/rest/v1/projects` | GET | List all projects (existing) |
| `/rest/v1/touch_queue` | POST | Queue a touch request |
| `/rest/v1/touch_queue?project_id=eq.{id}` | GET | Check touch status |

### API Endpoints (Edge Functions)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/functions/v1/meta` | GET | Project count/stats (existing) |
| `/functions/v1/docs` | GET | OpenAPI spec (JSON) |

## Implementation Steps

### Phase 1: Database Schema
1. Create migration for `touch_queue` table
2. Add RLS policies for anon access
3. Add indexes for efficient polling

### Phase 2: Queue Processor
1. Create `src/touch/queue-processor.ts`
2. Integrate with watch mode in orchestrator
3. Add configuration for poll interval
4. Handle error cases (project not found, touch failed)

### Phase 3: API Documentation
1. Create OpenAPI spec (`openapi.yaml`)
2. Create edge function to serve spec
3. Add Swagger UI endpoint (optional)
4. Update README with API documentation link

### Phase 4: Testing
1. Unit tests for queue processor
2. Integration test for touch queue flow
3. Manual testing with Raycast

## Database Schema

```sql
-- Touch queue for async touch operations
CREATE TABLE public.touch_queue (
  id SERIAL PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ,
  created_by TEXT DEFAULT 'api'
);

-- Index for efficient polling
CREATE INDEX idx_touch_queue_pending
  ON touch_queue(status, created_at)
  WHERE status = 'pending';

-- RLS for anon access
ALTER TABLE touch_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow anon to insert touch requests"
  ON touch_queue FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Allow anon to read own requests"
  ON touch_queue FOR SELECT
  USING (true);

-- Auto-cleanup: delete completed requests older than 1 hour
CREATE OR REPLACE FUNCTION cleanup_old_touch_requests()
RETURNS void AS $$
BEGIN
  DELETE FROM touch_queue
  WHERE status IN ('completed', 'failed')
  AND created_at < now() - interval '1 hour';
END;
$$ LANGUAGE plpgsql;
```

## OpenAPI Spec Outline

```yaml
openapi: 3.0.3
info:
  title: ChatGPT Project Indexer API
  version: 1.0.0
  description: API for managing ChatGPT project data and touch operations

servers:
  - url: http://127.0.0.1:54321
    description: Local Supabase instance

paths:
  /rest/v1/projects:
    get:
      summary: List all projects

  /rest/v1/touch_queue:
    post:
      summary: Queue a touch request
      requestBody:
        content:
          application/json:
            schema:
              type: object
              properties:
                project_id:
                  type: string
              required:
                - project_id
      responses:
        201:
          description: Touch request queued

    get:
      summary: Get touch request status
      parameters:
        - name: project_id
          in: query
          schema:
            type: string

  /functions/v1/meta:
    get:
      summary: Get index metadata
```

## Raycast Integration

### New Touch Action
```typescript
// In Raycast extension
async function touchProject(projectId: string) {
  const response = await fetch(`${apiUrl}/rest/v1/touch_queue`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': supabaseAnonKey,
    },
    body: JSON.stringify({ project_id: projectId }),
  });

  if (response.ok) {
    showToast({ title: 'Touch queued', message: 'Project will float to top shortly' });
  }
}
```

## Success Criteria

- [ ] Touch request via API triggers project to float to top within 10 seconds
- [ ] OpenAPI spec available at `/functions/v1/docs`
- [ ] README updated with API documentation
- [ ] All existing tests pass
- [ ] New unit tests for queue processor

## Out of Scope

- Real-time websocket notifications (polling is sufficient)
- Bulk touch operations (single project per request)
- Authentication/authorization (local-only use case)

## Related ADRs (Created)

- [ADR 012: Queue-Based Touch API](../../doc/decisions/012-queue-based-touch-api.md)
- [ADR 013: Atomic Run Support for Data Integrity](../../doc/decisions/013-atomic-run-support.md)

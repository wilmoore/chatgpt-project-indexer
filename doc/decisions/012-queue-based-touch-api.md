# 012. Queue-Based Touch API

Date: 2026-01-16

## Status

Accepted

## Context

The ChatGPT Project Indexer has a "touch" feature that floats projects to the top of the ChatGPT sidebar by triggering a UI interaction (icon color flip). This functionality was only available via CLI.

External clients like Raycast extensions needed a way to trigger touch operations programmatically via the existing REST API (`http://127.0.0.1:54321/rest/v1`).

Key constraints:
- Touch requires an active browser session with ChatGPT authentication
- The indexer already runs in watch mode with periodic scanning
- Users should not need to run multiple services
- Touch should complete within 5-10 seconds of request

## Decision

Implement a queue-based asynchronous pattern using PostgREST:

1. **Touch Queue Table**: A `touch_queue` table stores pending touch requests with status tracking (`pending`, `processing`, `completed`, `failed`)

2. **Queue Processor**: A `TouchQueueProcessor` class polls the queue every 5 seconds during watch mode and executes touches using the existing browser session

3. **API via PostgREST**: Clients POST to `/rest/v1/touch_queue` to queue requests and GET to check status - no new edge functions required

4. **Integration with Watch Mode**: Queue polling starts automatically when the indexer runs in watch mode, reusing the authenticated browser session

## Consequences

### Positive
- No additional services for users to run
- Reuses existing PostgREST infrastructure (same URL as project list)
- 5-second polling provides acceptable latency (5-10 seconds total)
- Status tracking enables clients to show progress
- Automatic cleanup of old requests prevents table bloat

### Negative
- Polling adds small overhead during watch mode
- Slightly higher latency vs direct execution (but acceptable for use case)
- Requires watch mode to be running for touch to work

## Alternatives Considered

### 1. Direct Edge Function Touch
Create an edge function that directly executes touch operations.

**Rejected because:** Edge functions cannot access the browser session. Touch requires Playwright with authenticated ChatGPT state, which only the indexer process has.

### 2. Separate Touch Server
Run a dedicated touch server alongside the indexer.

**Rejected because:** Adds operational complexity. Users would need to manage multiple processes. The queue pattern achieves the same result with simpler deployment.

### 3. WebSocket Real-time
Use Supabase Realtime for instant touch notification.

**Rejected because:** Over-engineered for the use case. 5-10 second latency is acceptable for "floating a project to top". Polling is simpler and sufficient.

## Related

- ADR 008: Supabase Edge Functions for API Access
- ADR 009: Invisible Touch for Project Pinning
- Planning: `.plan/.done/feat-touch-api-and-docs/`

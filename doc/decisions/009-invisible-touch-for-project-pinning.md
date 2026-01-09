# 009. Invisible Touch for Project Pinning

Date: 2026-01-09

## Status

Accepted

## Context

ChatGPT Projects lacks native pinning functionality. As users accumulate projects, their active working set gets buried by newer ones. Power users need a way to keep important projects at the top of the sidebar without polluting project titles or creating fake conversations.

We discovered that ChatGPT's sidebar sorts projects by "last touched" timestamp, and that changing a project's icon color triggers this timestamp update.

## Decision

Implement project pinning via an "invisible touch" mechanism:

1. **Primary mechanism (icon color flip):**
   - Fetch current project state via `GET /backend-api/gizmos/{id}`
   - POST to `/backend-api/gizmos/snorlax/upsert` with `display.theme` changed to a temporary color
   - Immediately POST again to restore original color
   - Net effect: project floats to top, zero visible change

2. **Feature-flagged fallback mechanisms:**
   - `conversation_dot`: Add/remove "." in top conversation title
   - `title_touch`: Append/remove space in project title

3. **Browser-based API calls:** Execute via `page.evaluate()` to inherit session authentication, avoiding manual cookie management.

## Consequences

### Positive

- **Zero UX pollution:** No fake messages, no title prefixes, no visible changes
- **Cross-platform:** Works on desktop and mobile (server-side timestamp)
- **Fully reversible:** Unpin = stop touching, nothing to clean up
- **Resilient:** Feature flags allow mechanism switching without code changes

### Negative

- **Undocumented API dependency:** Relies on ChatGPT's internal behavior that could change
- **Browser session required:** Touch operations need an active browser context
- **Potential rate limiting:** Rapid touches could trigger API throttling

## Alternatives Considered

### 1. UI automation (click pin button)
**Rejected:** ChatGPT has no native pin button. Would require OpenAI to implement.

### 2. Conversation mutation (add/remove messages)
**Rejected:** Pollutes conversation history, not invisible.

### 3. Title prefix (e.g., "★ Project Name")
**Rejected:** Pollutes project titles, fragile, user-visible.

### 4. Direct API calls with extracted cookies
**Rejected:** Complex cookie management, session handling; browser context approach is simpler and more reliable.

## Related

- Planning: `.plan/.done/feat-project-pinning/`
- API endpoint: `POST /backend-api/gizmos/snorlax/upsert`
- Touch module: `src/touch/`

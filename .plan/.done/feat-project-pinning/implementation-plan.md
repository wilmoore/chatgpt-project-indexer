# Implementation Plan: Project Pinning

**Created:** 2026-01-07
**Status:** Ready for implementation
**Approach:** Personal tool first, minimal viable implementation

---

## Overview

Add invisible project pinning to chatgpt-project-indexer. Pinned projects automatically "float" to the top of the ChatGPT sidebar via periodic touch operations.

**Core mechanism:** Touch pinned projects to exploit ChatGPT's "last touched floats to top" sorting behavior.

---

## Architecture Decision

### Touch Mechanism: Icon Color Flip (Primary)

```
1. Read current icon color
2. Set to different color
3. Immediately restore original color
4. Net effect: Project floats to top, zero visible change
```

**Why this approach:**
- No conversation mutation
- No title pollution
- Sub-second execution
- Server-side effect (works cross-platform)

### Fallback: Conversation Dot (if needed)

```
1. Find top conversation in project
2. Append "." to title
3. Immediately remove "."
4. Triggers touch timestamp
```

**Feature flag:** `TOUCH_MECHANISM = "icon_color" | "conversation_dot"`

---

## Implementation Phases

### Phase 1: Data Model & Storage
**Goal:** Store pin state

| Task | File | Change |
|------|------|--------|
| Add `pinned` field | `src/types/index.ts` | `pinned?: boolean` |
| Add `pinnedAt` field | `src/types/index.ts` | `pinnedAt?: string` |
| Update schema validation | `src/storage/schema.ts` | Add fields to schema |
| Update Supabase mapping | `src/storage/supabase.ts` | Map to DB columns |

**Migration (Supabase):**
```sql
ALTER TABLE projects ADD COLUMN pinned BOOLEAN DEFAULT FALSE;
ALTER TABLE projects ADD COLUMN pinned_at TIMESTAMPTZ;
CREATE INDEX idx_projects_pinned ON projects(pinned) WHERE pinned = TRUE;
```

### Phase 2: CLI Commands
**Goal:** Manual pin/unpin operations

| Command | Description |
|---------|-------------|
| `pin <id>` | Mark project as pinned |
| `unpin <id>` | Remove pin from project |
| `list --pinned` | Show only pinned projects |
| `touch` | Touch all pinned projects now |

**File:** `src/index.ts`

```typescript
program
  .command('pin <projectId>')
  .description('Pin a project to keep it at the top')
  .action(async (projectId) => {
    await pinProject(projectId);
  });

program
  .command('touch')
  .description('Touch all pinned projects to float them to top')
  .action(async () => {
    await touchPinnedProjects();
  });
```

### Phase 3: Touch Mechanism (Core)
**Goal:** Implement invisible touch via icon color

**New file:** `src/touch/index.ts`

```typescript
export interface TouchMechanism {
  touch(page: Page, projectId: string): Promise<void>;
}

export class IconColorTouch implements TouchMechanism {
  async touch(page: Page, projectId: string): Promise<void> {
    // 1. Navigate to project settings (or find icon in sidebar)
    // 2. Read current color
    // 3. Click different color
    // 4. Click original color
    // 5. Verify project timestamp updated
  }
}

export class ConversationDotTouch implements TouchMechanism {
  async touch(page: Page, projectId: string): Promise<void> {
    // 1. Find top conversation in project
    // 2. Rename: append "."
    // 3. Rename: remove "."
  }
}
```

**New file:** `src/touch/icon-color.ts`
- Selector for icon color picker in project settings
- Color cycling logic (pick any different color, restore)
- Verification: check sidebar order changed

**New file:** `src/touch/selectors.ts`
```typescript
export const TOUCH_SELECTORS = {
  projectSettings: [
    '[data-testid="project-settings"]',
    'button[aria-label*="settings"]',
    // fallback chain
  ],
  iconColorPicker: [
    '[data-testid="icon-color-picker"]',
    'button[aria-label*="color"]',
  ],
  colorOptions: [
    '[data-testid="color-option"]',
    'button[role="option"]',
  ],
};
```

### Phase 4: Touch Orchestration
**Goal:** Automated touching of pinned projects

**File:** `src/touch/orchestrator.ts`

```typescript
export async function touchPinnedProjects(
  page: Page,
  storage: StorageBackend,
  mechanism: TouchMechanism
): Promise<TouchResult> {
  const projects = await storage.getAll();
  const pinned = projects.filter(p => p.pinned);

  // Touch in reverse priority order (least important first)
  // so most important ends up at very top
  const sorted = sortByPinnedAt(pinned).reverse();

  for (const project of sorted) {
    await mechanism.touch(page, project.id);
    await delay(CONFIG.DELAYS.BETWEEN_TOUCHES); // Rate limiting
  }

  return { touched: sorted.length, failed: 0 };
}
```

### Phase 5: Watch Mode Integration
**Goal:** Auto-touch pinned projects on schedule

**File:** `src/scraper/orchestrator.ts` (modify)

```typescript
// In watch mode loop, after enumeration:
if (CONFIG.TOUCH.AUTO_ENABLED) {
  const touchResult = await touchPinnedProjects(page, storage, mechanism);
  logger.info(`Touched ${touchResult.touched} pinned projects`);
}
```

**Config addition:**
```typescript
CONFIG.TOUCH = {
  AUTO_ENABLED: true,
  MECHANISM: 'icon_color', // or 'conversation_dot'
  INTERVAL_MS: 3600000,    // Touch every hour in watch mode
  BETWEEN_TOUCHES_MS: 500, // Rate limit between project touches
};
```

---

## File Changes Summary

### New Files
```
src/touch/
├── index.ts           # Touch mechanism interface + factory
├── icon-color.ts      # Icon color flip implementation
├── conversation-dot.ts # Fallback: conversation title touch
├── orchestrator.ts    # Touch all pinned projects
└── selectors.ts       # DOM selectors for touch UI
```

### Modified Files
```
src/types/index.ts         # Add pinned, pinnedAt fields
src/storage/schema.ts      # Validate new fields
src/storage/supabase.ts    # Map to DB columns
src/config/constants.ts    # Add TOUCH config section
src/index.ts               # Add pin/unpin/touch commands
src/scraper/orchestrator.ts # Integrate touch in watch mode
```

---

## Verification Plan

### Manual Testing
1. **Pin command works:** `chatgpt-indexer pin <id>` updates storage
2. **Touch mechanism works:** Run touch, verify project moves to top
3. **Touch is invisible:** No visible flicker or artifacts
4. **Fallback works:** Switch mechanism, verify touch still works
5. **Watch mode integration:** Pinned projects stay at top over time

### Automated Testing
```typescript
// test/touch.test.ts
describe('TouchMechanism', () => {
  it('icon color touch updates project timestamp', async () => {
    // Mock page, verify API calls or DOM changes
  });

  it('touch is idempotent', async () => {
    // Touch same project twice, no errors
  });

  it('fallback mechanism works when primary fails', async () => {
    // Simulate icon color failure, verify dot fallback
  });
});
```

---

## Risk Mitigations

| Risk | Mitigation |
|------|------------|
| Icon color change doesn't trigger touch | Feature flag to conversation_dot fallback |
| Rate limiting on rapid touches | 500ms delay between touches |
| ChatGPT DOM changes | Selector fallback chains |
| Touch fails mid-operation | Transaction-like: restore state on error |
| Watch mode browser dies | Existing auto-restart logic handles this |

---

## Implementation Order

```
Week 1: Foundation
├── Phase 1: Data model (1 hour)
├── Phase 2: CLI commands (2 hours)
└── Manual testing with hardcoded touch

Week 2: Core Mechanism
├── Phase 3: Touch mechanism (4-6 hours)
│   ├── Discover ChatGPT icon color UI
│   ├── Implement IconColorTouch
│   └── Test manually
└── Phase 4: Orchestration (2 hours)

Week 3: Integration
├── Phase 5: Watch mode (1 hour)
├── End-to-end testing (2 hours)
└── Dogfood for 1 week

Week 4+: Product (Side-Quest)
├── Bundle with Conversation Title plugin
├── Premium unlock flow
└── User documentation
```

---

## Definition of Done

### Personal Tool (MVP)
- [ ] Can pin/unpin projects via CLI
- [ ] `touch` command floats pinned projects to top
- [ ] Touch is invisible (no flicker, no artifacts)
- [ ] Works reliably for 1 week in watch mode
- [ ] Fallback mechanism implemented and tested

### Product (Future)
- [ ] Conversation Title plugin integration
- [ ] Premium unlock/paywall
- [ ] User-facing documentation
- [ ] Error handling and user feedback

---

## API Discovery Notes

### ChatGPT Project Icon Color

**To discover:**
1. Open ChatGPT, go to project settings
2. Open DevTools Network tab
3. Change icon color
4. Capture the API request

**Expected:**
```
PATCH /backend-api/gizmo/g-p-{projectId}
{
  "profile_picture_path": "color:{color_name}"
}
```

Or possibly GraphQL mutation. Capture and document.

### Conversation Title Touch (Fallback)

**To discover:**
1. Rename a conversation
2. Capture API request

**Expected:**
```
PATCH /backend-api/conversation/{conversationId}
{
  "title": "New Title"
}
```

---

## Quick Start

Once implementation begins:

```bash
# Phase 1: Test data model
npm run build
chatgpt-indexer run  # Enumerate projects
# Manually edit ~/.chatgpt-indexer/projects.json to add pinned: true

# Phase 2: Test CLI
chatgpt-indexer pin abc123
chatgpt-indexer list --pinned

# Phase 3: Test touch
chatgpt-indexer touch  # Should move pinned projects to top
# Verify in ChatGPT sidebar
```

---

*Plan created: 2026-01-07*
*Ready for implementation*

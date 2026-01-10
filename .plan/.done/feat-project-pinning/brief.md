# Product Brief

**Working Title:** Project Pinning (via Invisible Touch)
**Created:** 2026-01-07T00:00:00Z
**Updated:** 2026-01-07T17:45:00Z
**Status:** VALIDATED - GO

---

## Problem Statement

What specific problem are we solving?

ChatGPT Projects lacks native pinning. As users create more projects, their active working set gets buried by newer ones. Finding important projects requires scrolling, pagination, or relying on memory.

**Who has this problem?**
Power ChatGPT users who maintain multiple concurrent projects—founders, developers, researchers, and knowledge workers with established workflows.

**How painful is it?**
Daily friction, not hair-on-fire. But compounding: the more you use ChatGPT Projects, the worse it gets. Kills the muscle memory that makes tools feel fast.

**How do they solve it today?**
- Scroll and hunt
- Create new "pointer" projects to reference old ones
- Rename projects with prefixes like "★" or "01-" (fragile, pollutes titles)
- Just accept the friction

---

## Proposed Solution

What are we building?

**Core value proposition:** Keep your active projects at the top of the ChatGPT sidebar, permanently, without changing anything visible.

**Key capabilities:**
- User selects projects to "pin"
- System periodically "touches" pinned projects via configurable mechanism
- Touch is sub-second, invisible, and triggers ChatGPT's native "last touched floats to top" behavior
- Works cross-platform (desktop + mobile) because sorting is server-side

**Touch mechanisms (feature-flagged):**
1. **Primary:** Icon color flip-and-restore (invisible, no artifacts)
2. **Fallback:** Drop "." in top-most conversation (if icon touch breaks)

**What makes it different from alternatives?**
- **Zero UX pollution:** No fake messages, no conversation mutation, no visible changes
- **Native feel:** Competitors like Superpower ChatGPT replace the entire UI—we leave ChatGPT alone
- **Invisible by design:** Users want ChatGPT to feel like ChatGPT, not a modded game client
- **Fully reversible:** Unpin = stop touching. Nothing to clean up.

---

## Strategic Context

### Primary Goal
**Personal tool first.** Solve our own workflow friction. Product is a side-quest.

### Why This Matters
- No pressure to ship before ready
- Can iterate based on personal use
- Product-market fit validation happens organically
- If OpenAI ships native pinning, we just... use that

### Competitive Positioning
Competitors (Superpower ChatGPT, ChatGPT Toolbox, etc.) suffer from bloat:
- Alternative UIs that feel foreign
- Feature creep that complicates the interface
- Nerd-focused design that alienates mainstream users

Our positioning: **"Invisible power tools."** ChatGPT stays ChatGPT. The magic happens underneath.

---

## Target Customer

### Primary (Self)
- Power ChatGPT user with 20+ active projects
- Already built Project Indexer—natural extension
- Wants control, not discovery

### Secondary (Product)
- **Conversation Title plugin users** — existing distribution, natural upsell
- Power ChatGPT users with 10+ active projects
- Anyone who's built muscle memory around ChatGPT and feels friction when it breaks

---

## Why Now?

**Platform maturity:** ChatGPT Projects has been out long enough that power users are hitting scale limits. Early adopters have accumulated 20-50+ projects.

**Behavioral pattern discovered:** The "last touched floats to top" behavior is consistent and exploitable via icon color changes—a clean mechanism that doesn't pollute conversations.

**Foundation exists:** Project Indexer already solved discovery. Pinning is the natural next lever: from "find your projects" to "control your projects."

**OpenAI is slow and buggy:** GPT-5 launch was a disaster. Their native chat pinning is limited to 3 chats. We can ship faster and better.

---

## Business Model

### Phase 1: Personal Tool
Free. Build it, use it, refine it.

### Phase 2: Product (Side-Quest)
**Distribution:** Bundle with Conversation Title plugin as premium upsell
- Free: Conversation titles
- Premium: Pinning + titles (or broader "ChatGPT Power Tools" bundle)

**Pricing intuition:** $5-10/month or one-time unlock. Low friction.

**Why this works:**
- Existing user base through free extension
- No cold-start distribution problem
- Natural "upgrade for more" flow

---

## Technical Strategy

### Touch Mechanism Design
Feature-flagged touch mechanisms for resilience:

```
TOUCH_MECHANISM = "icon_color" | "conversation_dot" | "title_touch"
```

| Mechanism | How It Works | Artifacts | Risk |
|-----------|--------------|-----------|------|
| `icon_color` | Flip icon color, restore immediately | None | Medium (undocumented) |
| `conversation_dot` | Add "." to top conversation title, remove | Minimal (sub-second) | Low |
| `title_touch` | Append/remove space in project title | None | Low |

**Default:** `icon_color`
**Fallback:** `conversation_dot` (10-minute code change if needed)

### Resilience
- Feature flags allow switching without code deploy
- Multiple mechanisms = no single point of failure
- If OpenAI changes behavior, swap mechanism, not architecture

---

## Key Assumptions

What must be true for this to work?

1. ~~**ChatGPT's "last touched" sorting remains stable**~~ → Mitigated by fallback mechanisms
2. ~~**Icon color changes remain a valid "touch"**~~ → Feature-flagged, swappable
3. **Touch mechanism exists that's invisible and reliable** — at least one must work
4. **Users value invisible power over visible UI changes** — our core bet

---

## Open Questions

What don't we know yet?

- [x] ~~How often does the touch need to run to maintain position?~~ → Test empirically
- [x] ~~Does OpenAI rate-limit or flag rapid icon changes?~~ → Will discover; fallback exists
- [ ] What's the ceiling on "pinned" projects before this becomes unwieldy?
- [x] ~~Will OpenAI ship native pinning and obsolete this?~~ → Accept risk; personal tool first
- [ ] How do we handle mobile-only users who can't run background touches?

---

## Success Criteria

### Personal Tool
- [ ] Pinned projects stay at top of sidebar
- [ ] Touch mechanism is invisible (no flicker, no artifacts)
- [ ] Works reliably for 1 week without intervention

### Product
- [ ] Conversation Title users can upgrade to pinning
- [ ] Zero support tickets about "weird behavior"
- [ ] Positive signal: users ask for it before we ship it

---

*Generated by /pro:product.brief*
*Validated: 2026-01-07 — GO*

# Product Requirements Document

**Product:** ChatGPT Project Indexer
**Mode:** Guided
**Status:** Locked

---

## 1. Product Thesis

### Problem

Power users of ChatGPT with a large number of Projects cannot reliably access, browse, or retrieve the full list of their Projects across platforms.

On web, Projects are hidden behind a paginated "See more" menu in the sidebar. This menu relies on delayed infinite scrolling and auto-dismiss behavior. Fully loading the list requires continuous manual scrolling and sustained hover to prevent dismissal. The process is slow, fragile, and must be repeated every time an older Project needs to be found.

On mobile and other non-web platforms, the Project list is truncated entirely. Projects beyond an implicit cutoff are not visible and cannot be discovered. Search does not solve this because it searches chats globally and does not reliably surface Projects unless the exact title is known.

As a result, Projects become effectively undiscoverable at scale, despite still existing and being accessible via direct links.

---

### Target User

A single advanced ChatGPT user with a very large number of Projects, far beyond the threshold where pagination and truncation issues appear.

Characteristics:

* Heavy long-term Project usage
* Rare deletion
* Sporadic access to older Projects
* Comfortable with CLI tools and automation
* Blocked by UI limitations, not permissions

---

### Proposed Solution

A long-running, unattended automation process that authenticates as the user in ChatGPT Web, navigates the Projects sidebar, and enumerates all Projects reliably.

The system:

* Uses a real browser session
* Opens and maintains the Projects menu
* Scrolls until all Projects are loaded
* Hovers each Project entry to reveal full titles
* Captures Project identifiers without clicking
* Writes results incrementally to persistent storage

---

### Value Proposition

* Eliminates manual scrolling and waiting
* Restores full discoverability of Projects
* Enables fast lookup outside ChatGPT UI
* Unlocks cross-platform access via deep links

---

### Initial Scope Boundary

The product:

* Does not modify Projects
* Does not read or scrape chat contents
* Does not replace ChatGPT functionality
* Is read-only and enumeration-only

---

### Success Definition for MVP

The MVP is successful if:

* 100 percent of Projects visible on ChatGPT Web are captured
* Full titles match tooltip-expanded text
* Identifiers open the correct Projects
* The process runs unattended and recovers from auth loss

---

## 2. Core Design Principles

### DP-01 Read-only by construction

No mutation of user data under any circumstances.

---

### DP-02 UI-state resilience over speed

Correctness and completeness override runtime duration.

---

### DP-03 Emulate real user behavior

Use real hover, focus, and scrolling behavior.

---

### DP-04 Full-fidelity capture

Truncated or inferred data is unacceptable.

---

### DP-05 Idempotent extraction

Multiple passes must not corrupt or duplicate logical records.

---

### DP-06 Explicit failure modes

Silent failure is disallowed.

---

### DP-07 Storage-agnostic output

Enumeration is decoupled from consumption.

---

### DP-08 Single-user optimization

No generalization or multi-user abstraction.

---

## 3. Personas

### P-001 Power ChatGPT Project Hoarder (Primary)

**Goals**

* Find any Project regardless of age
* Avoid UI friction
* Restore mobile access via links

**Pain Points**

* Slow infinite scroll
* Auto-dismiss menus
* Truncated titles
* No Project-level search
* Mobile truncation

---

### P-002 Same User on Mobile (Non-MVP)

Consumer of indexed data only.

---

### P-003 General ChatGPT User (Excluded)

Does not experience the problem.

---

## 4. Input Scenarios

### IS-001 Initial startup and bootstrap

User starts the process once. Enumeration begins and writes incrementally.

---

### IS-002 Continuous background enumeration

The process runs unattended, patiently scrolling and hovering until exhaustion.

---

### IS-003 Credential degradation detected

System detects early auth risk and notifies the user.

---

### IS-004 Credential expiration detected

System pauses, notifies, foregrounds browser, resumes after login.

---

### IS-005 Idle steady state

System remains running with no active scraping.

---

### IS-006 Controlled shutdown

Graceful stop with safe restart later.

---

## 5. User Journeys

### J-001 Start and enumerate all Projects

End-to-end initial indexing.

---

### J-002 Long-running idle monitoring

Unattended steady state.

---

### J-003 Preemptive credential warning

Early user notification.

---

### J-004 Credential expiration and recovery

Pause, re-authenticate, resume.

---

### J-005 Graceful shutdown and resume

Safe interruption handling.

---

## 6. UX Surface Inventory

### S-001 Terminal (CLI)

Status, progress, warnings, errors.

---

### S-002 Automated browser session

Headful by default, unattended, backgroundable.

Startup rule:

* Attempt headless
* Fall back to headful automatically
* Remain unattended unless notified

---

### S-003 Projects sidebar menu

Expandable, infinite-scroll list with tooltip titles.

---

### S-004 Notification surface

macOS notifications, terminal alerts, optional sound.

---

### S-005 Storage surface

Persistent sink only, no UI responsibility.

---

## 7. Behavior and Editing Model

### Captured Information (Conceptual)

* Stable Project identifier
* Full human-readable title
* First observation moment
* Most recent confirmation moment

---

### Discovery Semantics

A Project is considered discovered only when its identifier and full title are resolved via hover.

---

### Update Semantics

Re-encounter refreshes confirmation state and title if changed.

---

### Progress and Resume

Re-processing is acceptable. Missing data is not.

---

### Absence Semantics

Deletion is not inferred in MVP.

---

### Unattended Guarantees

User interaction only occurs after explicit notification.

---

## 8. Constraints and Anti-Features

### Constraints

* Web-only enumeration
* Single user
* Read-only
* No speed guarantees

---

### Anti-Features

* No chat scraping
* No Project search UI
* No mobile scraping
* No SaaS product
* No paid offering

---

## 9. Success and Failure Criteria

### Success

* Complete enumeration
* Full title fidelity
* Correct identifiers
* Unattended execution
* Auth recovery
* Idempotence
* Explicit failures

---

### Failure

* Silent truncation
* Truncated titles
* Auth ambiguity
* Infinite hang
* Data corruption

---

## 10. North Star

**100 percent Project discoverability without manual UI navigation**

---

## 11. Epics

* E-001 Browser automation bootstrap
* E-002 Authentication detection and recovery
* E-003 Projects menu navigation
* E-004 Infinite scroll exhaustion
* E-005 Hover-based inspection
* E-006 Progress tracking and resume
* E-007 Long-running process management
* E-008 Notification and alerting

---

## 12. User Stories with Acceptance Criteria

US-001 through US-012 as defined, each with testable Given/When/Then criteria covering auth, hover, scrolling, resume, idle, and notifications.

---

## 13. Traceability Map

All Journeys, Epics, Stories, and Surfaces are fully mapped with no orphans and no violations of traceability rules.

---

## 14. Lo-fi UI Mockups (ASCII)

ASCII representations of:

* CLI states
* Browser states
* Projects menu hover behavior
* Auth interruption
* Notifications

No image-based mockups used.

---

## End State

This PRD is internally consistent, scope-controlled, and implementation-ready.
No uncertainty is hidden. No premature constraints are imposed.

**This PRD is complete. Copy this Markdown into Word, Google Docs, Notion, or directly into a coding model.**

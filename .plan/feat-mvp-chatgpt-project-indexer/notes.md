# MVP: ChatGPT Project Indexer

**Branch:** `feat/mvp-chatgpt-project-indexer`
**Started:** 2025-12-25

## Scope

Deliver a working CLI tool that enumerates all ChatGPT Projects via browser automation.

### MVP Epics (11 items in-progress)

**Epics:**
- E-001: Browser automation bootstrap
- E-002: Authentication detection and recovery
- E-003: Projects menu navigation
- E-004: Infinite scroll exhaustion
- E-005: Hover-based inspection

**Stories:**
- US-001: Initial startup and enumeration
- US-002: Background enumeration
- US-004: Credential expiration recovery
- US-005: Hover for full title capture
- US-006: Project identifier capture
- US-012: Persistent storage output

## Success Criteria (from PRD)

- 100% of Projects visible on ChatGPT Web are captured
- Full titles match tooltip-expanded text
- Identifiers open the correct Projects
- Process runs unattended and recovers from auth loss

## Deferred (Non-MVP)

- E-006: Progress tracking and resume
- E-007: Long-running process management
- E-008: Notification and alerting
- US-003: Credential degradation warning
- US-007: Idempotent re-enumeration
- US-008: Graceful shutdown
- US-009: Idle steady state
- US-010: CLI status output
- US-011: macOS notifications

## Technical Decisions

*To be determined during planning*

## Progress Log

- 2025-12-25: Created branch, set up planning directory

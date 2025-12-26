# 002. Layered Architecture with Separation of Concerns

Date: 2025-12-25

## Status

Accepted

## Context

The indexer performs multiple distinct operations:
- Browser lifecycle management
- Authentication detection and recovery
- Navigation through the ChatGPT UI
- Scrolling to load all projects
- Data extraction from DOM elements
- Output storage

We needed an architecture that supports maintainability, testability, and future extensibility.

## Decision

We adopted a layered architecture with clear separation of concerns:

```
src/
├── auth/          # Authentication detection and recovery
├── browser/       # Browser context and lifecycle management
├── config/        # Constants and configuration
├── scraper/       # Core scraping logic (orchestrator, navigator, scroller, extractor)
├── storage/       # Output writing and schema
└── types/         # Shared TypeScript types
```

Each layer has a single responsibility:
- **Browser layer**: Manages Playwright contexts and page lifecycle
- **Auth layer**: Detects login state and handles re-authentication
- **Scraper layer**: Orchestrates the enumeration workflow
- **Storage layer**: Handles persistent output

## Consequences

### Positive

- Each module is independently testable
- Clear contracts between layers via TypeScript interfaces
- Easy to extend (add new scrapers, storage backends, etc.)
- Debugging is simplified with isolated concerns
- New team members can understand one layer at a time

### Negative

- More files and directories than a monolithic approach
- Cross-layer changes require touching multiple files
- Some abstraction overhead for a relatively small project

## Alternatives Considered

1. **Single-file script**: Faster to write but unmaintainable as requirements grow
2. **Class-based OOP**: More boilerplate; functional approach with modules is cleaner for this use case

## Related

- Planning: `.plan/.done/feat-mvp-chatgpt-project-indexer/`

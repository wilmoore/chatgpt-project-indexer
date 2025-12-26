# 001. Use Playwright for Browser Automation

Date: 2025-12-25

## Status

Accepted

## Context

The ChatGPT Project Indexer needs to enumerate all projects from the ChatGPT web interface. This requires:
- Navigating to chatgpt.com and handling authentication
- Interacting with dynamic UI elements (menus, infinite scroll)
- Extracting data from hover states (tooltips for full titles)
- Persisting browser state across runs for authentication

Several browser automation options were considered: Puppeteer, Selenium, Playwright, and custom HTTP-based scraping.

## Decision

We chose Playwright as the browser automation framework.

## Consequences

### Positive

- Built-in support for persistent browser contexts (handles auth cookies automatically)
- Modern async/await API with TypeScript support
- Auto-waiting reduces flaky tests and race conditions
- Cross-browser support (Chromium, Firefox, WebKit) for future flexibility
- Active development and strong community support
- Handles modern SPA interactions well (React, dynamic content)

### Negative

- Requires Chromium download (~150MB)
- Headful mode needed for initial auth (user must log in manually first run)
- Learning curve for team members unfamiliar with Playwright

## Alternatives Considered

1. **Puppeteer**: Similar capabilities but Playwright has better auto-waiting and persistent context support
2. **Selenium**: More mature but slower, heavier, and less TypeScript-friendly
3. **HTTP-based scraping**: Not viable since ChatGPT uses heavy client-side rendering and requires authentication

## Related

- Planning: `.plan/.done/feat-mvp-chatgpt-project-indexer/`

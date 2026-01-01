# 006. Portable Session Management via Playwright Storage State

Date: 2025-12-30

## Status

Accepted

## Context

The ChatGPT Project Indexer needs to run as a daemon on remote/headless servers. When authentication expires, users need a way to re-authenticate without physical access to a browser on that machine.

ChatGPT does not expose an OAuth API or Device Code Flow for third-party apps. Authentication is purely session-cookie-based through their web login flow.

We explored several approaches:
1. OAuth Device Code Flow (like `gh auth login`) - Not available, ChatGPT doesn't support it
2. Localhost OAuth callback (like `gcloud auth login`) - Not available, no OAuth endpoints
3. Remote Chrome DevTools Protocol (CDP) connection - Too complex, requires port forwarding
4. Browser extension cookie export - Manual process, format conversion needed
5. Playwright Storage State - Native JSON format, full session capture

## Decision

We use Playwright's `storageState()` API to export and import browser sessions as portable JSON files.

The workflow:
1. User runs `auth login` on any machine with a browser
2. Session (cookies, localStorage, IndexedDB) is saved to `auth-state.json`
3. File is transferred to remote server via SCP or similar
4. User runs `auth import` to validate and stage the session
5. On next `run`, the imported session is automatically applied

## Consequences

### Positive

- Works with ChatGPT's cookie-based authentication without needing official API support
- Portable JSON format is human-readable and transferable
- Leverages Playwright's native capabilities (no custom serialization)
- Supports the primary use case: daemon on remote headless server
- Session validation prevents using expired tokens
- Security: Files created with chmod 600, warnings on insecure permissions

### Negative

- Sessions can expire; users must re-authenticate periodically
- Requires secure file transfer (SCP, etc.) between machines
- Not as seamless as true OAuth Device Code Flow would be
- Auth file contains sensitive session tokens

## Alternatives Considered

1. **Remote CDP Connection**: Connect to Chrome via DevTools Protocol from remote server
   - Rejected: Requires keeping local Chrome running, port forwarding complexity, security concerns

2. **Persistent Context Directory Sync**: Rsync the entire browser-data directory
   - Rejected: Large files, platform-specific SQLite format, overkill for auth-only use case

3. **Manual Cookie Export**: Use browser extension to export cookies
   - Rejected: Manual process, requires format conversion, poor UX

## Related

- Planning: `.plan/.done/feat-cli-auth-subcommand/`
- Spike: `.plan/spike-cli-oauth-authentication/` (research phase)

# Feature: Add Authentication Helper Scripts

**Branch:** `feat/add-authentication-helper-scripts`
**Created:** 2026-01-19
**Status:** Planning

## Summary

Add npm scripts for frequently used authentication commands to reduce friction during development and daily use.

## Requirements

Add the following npm scripts using tsx (no build step required):

| Script | Command | Description |
|--------|---------|-------------|
| `auth:login` | `tsx src/index.ts auth login` | Opens browser for interactive authentication |
| `auth:status` | `tsx src/index.ts auth status` | Check current authentication status |
| `auth:export` | `tsx src/index.ts auth export` | Export current session to portable file |

## Design

### Existing Scripts (preserved)
```json
"dev": "tsx src/index.ts",
"dev:watch": "tsx --watch src/index.ts run --watch --interval 1m",
"watch": "node dist/index.js run --watch"
```

### New Scripts (to add)
```json
"auth:login": "tsx src/index.ts auth login",
"auth:status": "tsx src/index.ts auth status",
"auth:export": "tsx src/index.ts auth export"
```

## Implementation Steps

1. Edit `package.json` to add the three authentication scripts
2. Verify scripts work: `npm run auth:status`
3. Run typecheck to ensure no regressions

## Related ADRs

- **ADR-006:** Portable Session Management via Playwright Storage State

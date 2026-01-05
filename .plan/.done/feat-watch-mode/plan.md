# Watch Mode Implementation Plan

## Overview
Add `--watch` flag to `run` command for continuous enumeration with configurable interval.

## Requirements
- [x] Timer-based re-scan (default 15 minutes, configurable via `--interval`)
- [x] Delta detection: report new vs unchanged projects
- [x] Structured timestamped logging (journalctl/tail friendly)
- [x] Graceful shutdown on SIGTERM/SIGINT
- [x] Error resilience: log and retry on next interval (don't crash)

## Implementation
1. `src/utils/logger.ts` - Structured logging with ISO timestamps
2. `src/scraper/orchestrator.ts` - Add watch loop with delta detection
3. `src/index.ts` - Add --watch and --interval CLI flags
4. `src/config/constants.ts` - Add WATCH config section

## Timing Data (from empirical testing)
- Per-project time: ~0.65 seconds
- 371 projects: ~4 minutes
- Default interval: 15 minutes (3.7x scan time)

## Log Format
```
2026-01-04T10:00:00.000Z [INFO] Starting watch mode (interval: 15m)
2026-01-04T10:04:02.000Z [INFO] Scan complete: 371 projects (371 new, 0 unchanged)
2026-01-04T10:19:02.000Z [INFO] Scan complete: 371 projects (0 new, 371 unchanged)
2026-01-04T10:34:02.000Z [WARN] Scan failed: Auth expired - will retry in 15m
```

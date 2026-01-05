# 007. Watch Mode with Timer-Based Re-scanning

Date: 2026-01-04

## Status

Accepted

## Context

Users need the indexer to run continuously throughout the day, picking up new Projects as they are created. The system should remain running in a way that's easy to monitor and debug, without requiring a full systemd service setup initially.

Key requirements identified:
- Continuous operation with periodic re-scanning
- Delta detection to identify new vs unchanged projects
- Structured logging compatible with `tail` and `journalctl`
- Graceful shutdown on SIGTERM/SIGINT
- Error resilience (don't crash on failures, retry on next interval)

## Decision

We implement a `--watch` flag on the `run` command that keeps the process running with periodic re-scans.

Key design choices:

1. **Timer-based intervals**: Default 15 minutes, configurable via `--interval` (supports `15m`, `1h`, `30s` formats)

2. **Delta detection**: Track project IDs between scans and report "X new, Y unchanged" in logs

3. **Structured logging**: ISO 8601 timestamps with level prefixes (`[INFO]`, `[WARN]`, `[ERROR]`) for easy parsing

4. **Browser recovery**: If the browser page dies between scans, automatically relaunch on next scan attempt

5. **Interruptible sleep**: Check shutdown flag every second during sleep intervals for responsive termination

## Consequences

### Positive

- Simple to run: just add `--watch` flag, no additional tooling needed
- Easy to monitor: logs are tail-friendly and structured
- Resilient: failures don't crash the process, just skip to next interval
- Responsive shutdown: stops within 1 second of receiving SIGTERM/SIGINT
- Future-proof: can easily transition to systemd service later

### Negative

- Browser stays open continuously, consuming memory
- No built-in daemon mode (relies on external tools like `nohup`, `tmux`, or eventually systemd)
- Minimum 1-minute interval to prevent excessive load

## Alternatives Considered

1. **Systemd service from the start**: Rejected as premature - user wanted to monitor and debug before committing to service management

2. **File-watch trigger**: Touch a file to trigger rescan instead of timer. Rejected as more complex for the common use case

3. **Separate daemon process**: Fork to background. Rejected as harder to monitor logs

## Related

- Planning: `.plan/.done/feat-watch-mode/`
- Implements: E-007 (Long-running process management), US-009 (Idle steady state)

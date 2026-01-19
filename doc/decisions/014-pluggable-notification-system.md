# 014. Pluggable Notification System

Date: 2026-01-19

## Status

Accepted

## Context

Watch mode was failing silently when authentication timeouts occurred. Users had no visibility into failures without watching logs directly, which defeated the purpose of autonomous operation. The system would retry indefinitely, logging warnings, but the user had no way to know their projects weren't being updated.

Users need to be notified externally when authentication expires so they can re-authenticate promptly.

## Decision

Implement a pluggable notification system with multiple channels:

1. **Telegram Bot API** (recommended) - Free, simple REST API, no SDK required
2. **macOS Notification Center** - Auto-enabled on Mac via osascript, zero setup
3. **Twilio SMS** - Optional paid channel for critical alerts

The system includes:
- **Rate limiting** - Prevent notification spam (default: 1 per 30 minutes per event type)
- **Auto-recovery** - Attempt page refresh before alerting
- **Channel aggregation** - Send via all enabled channels, collect errors independently

Configuration is via environment variables, making it easy to enable/disable channels without code changes.

## Consequences

### Positive

- Users get immediate notification when auth expires
- Multiple channels provide redundancy (Telegram + macOS)
- Telegram is free and works on remote/headless servers
- macOS notifications work with zero setup for local development
- Rate limiting prevents alert fatigue
- Auto-recovery reduces false positives

### Negative

- Telegram requires one-time bot setup via BotFather
- Credentials must be stored in environment variables
- Rate limiting means repeated failures within cooldown window won't re-notify

## Alternatives Considered

### WhatsApp
Rejected - Requires WhatsApp Business API verification and typically has costs for high-volume usage.

### Slack Webhooks
Considered but deprioritized - Many users don't have Slack, and free tier has message limits.

### Email
Not implemented in initial version - Higher latency than push notifications, often ignored.

### node-notifier package
Considered for macOS - Decided to use native osascript to avoid additional dependency.

## Related

- Planning: `.plan/.done/fix-authentication-timeout-silent-failures/`
- Implements E-008 (Notification and alerting) from original spec

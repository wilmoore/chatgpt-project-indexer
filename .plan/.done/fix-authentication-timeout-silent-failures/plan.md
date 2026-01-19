# Implementation Plan: Notifications for Auth Failures

## Overview
Add notification support to alert users when authentication timeouts occur in watch mode, enabling truly autonomous operation.

## Notification Channel Options

### Option 1: Telegram Bot (Recommended - Free, No Account Required)
**Recommendation: Telegram Bot** for the following reasons:
- **Completely free** - no per-message costs
- **Simple REST API** - just HTTP GET/POST, no SDK needed
- **No business verification** - unlike WhatsApp
- **No messaging windows** - can send notifications anytime
- **One-time setup** - create bot via BotFather, get token, done

Setup steps:
1. Message @BotFather on Telegram, type `/newbot`
2. Follow prompts to name your bot
3. Receive bot token (e.g., `123456789:ABCdefGHIjklMNOpqrsTUVwxyz`)
4. Create a group or channel and add your bot
5. Get chat_id via API: `https://api.telegram.org/bot<TOKEN>/getUpdates`

### Option 2: macOS Notifications (Local Only)
**For local development on Mac:**
- Uses built-in `osascript` (no external service needed)
- Appears in Notification Center
- Can include sound alerts
- **Limitation**: Only works locally, not for remote/headless servers

### Option 3: Twilio SMS (Paid - Most Reliable)
- Pay-per-message (~$0.0079/SMS in US)
- Reliable delivery with built-in retry
- Works globally
- Best for critical production alerts

### Option 4: Discord Webhook (Free)
- Create a webhook URL in any Discord server
- Simple POST request
- Free and reliable
- Good if you already use Discord

## Design Decision

We'll implement a **pluggable notification system** with multiple channels:
1. **Telegram** (default recommendation - free)
2. **macOS** (auto-enabled on Mac)
3. **Twilio SMS** (optional - for those who want it)

Priority order: Telegram → macOS → Twilio (user can enable multiple)

## Architecture

```
src/
  notifications/
    index.ts          # Public API, channel router
    types.ts          # Interfaces
    channels/
      telegram.ts     # Telegram Bot API
      macos.ts        # osascript notifications
      twilio.ts       # SMS via Twilio
    rate-limiter.ts   # Prevent notification spam
```

## Notification Flow

```
Auth Failure Detected
        │
        ▼
┌───────────────────┐
│ Auto-Recovery     │ ← Try page refresh first
│ Attempt           │
└───────────────────┘
        │
        ▼
   Recovery failed?
        │
   Yes  │  No → Resume normal operation
        ▼
┌───────────────────┐
│ Rate Limit Check  │ ← Don't spam (1 notification per 30 min)
└───────────────────┘
        │
        ▼
   Within limit?
        │
   Yes  │  No → Log "notification suppressed"
        ▼
┌───────────────────┐
│ Send via enabled  │ → Telegram, macOS, and/or Twilio
│ channels          │
└───────────────────┘
```

## Configuration

### Environment Variables
```bash
# Telegram (Recommended - Free)
NOTIFY_TELEGRAM_ENABLED=true
TELEGRAM_BOT_TOKEN=123456789:ABCdefGHIjklMNOpqrsTUVwxyz
TELEGRAM_CHAT_ID=-1001234567890

# macOS Notifications (auto-enabled on Mac, can be disabled)
NOTIFY_MACOS_ENABLED=true

# Twilio SMS (Optional - Paid)
NOTIFY_SMS_ENABLED=true
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_FROM_NUMBER=+1xxxxxxxxxx
NOTIFY_TO_NUMBER=+1xxxxxxxxxx

# Rate limiting (applies to all channels)
NOTIFY_COOLDOWN_MINUTES=30  # Optional, default 30
```

## Implementation Steps

### 1. Create Notification Types (`src/notifications/types.ts`)
```typescript
export type NotificationChannel = 'telegram' | 'macos' | 'sms';

export interface TelegramConfig {
  enabled: boolean;
  botToken: string;
  chatId: string;
}

export interface MacOSConfig {
  enabled: boolean;
}

export interface TwilioConfig {
  enabled: boolean;
  accountSid: string;
  authToken: string;
  fromNumber: string;
  toNumber: string;
}

export interface NotificationConfig {
  telegram?: TelegramConfig;
  macos?: MacOSConfig;
  twilio?: TwilioConfig;
  cooldownMs: number;
}

export interface NotificationResult {
  sent: boolean;
  channels: NotificationChannel[];
  errors: { channel: NotificationChannel; error: string }[];
  suppressed?: boolean;
  reason?: string;
}

export type NotificationEvent =
  | 'auth_failure'
  | 'auth_recovered'
  | 'scan_complete'
  | 'critical_error';
```

### 2. Create Telegram Channel (`src/notifications/channels/telegram.ts`)
```typescript
export async function sendTelegram(
  config: TelegramConfig,
  message: string
): Promise<{ success: boolean; error?: string }> {
  const url = `https://api.telegram.org/bot${config.botToken}/sendMessage`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: config.chatId,
        text: message,
        parse_mode: 'HTML',
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      return { success: false, error: error.description };
    }

    return { success: true };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}
```

### 3. Create macOS Channel (`src/notifications/channels/macos.ts`)
```typescript
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export async function sendMacOSNotification(
  title: string,
  message: string
): Promise<{ success: boolean; error?: string }> {
  if (process.platform !== 'darwin') {
    return { success: false, error: 'macOS notifications only available on macOS' };
  }

  // Escape quotes for AppleScript
  const escapedTitle = title.replace(/"/g, '\\"');
  const escapedMessage = message.replace(/"/g, '\\"');

  const script = `display notification "${escapedMessage}" with title "${escapedTitle}" sound name "Glass"`;

  try {
    await execAsync(`osascript -e '${script}'`);
    return { success: true };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}
```

### 4. Create Twilio Channel (`src/notifications/channels/twilio.ts`)
```typescript
export async function sendSms(
  config: TwilioConfig,
  message: string
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const url = `https://api.twilio.com/2010-04-01/Accounts/${config.accountSid}/Messages.json`;

  const auth = Buffer.from(
    `${config.accountSid}:${config.authToken}`
  ).toString('base64');

  const body = new URLSearchParams({
    To: config.toNumber,
    From: config.fromNumber,
    Body: message.slice(0, 160),
  });

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
    });

    if (!response.ok) {
      const error = await response.json();
      return { success: false, error: error.message };
    }

    const result = await response.json();
    return { success: true, messageId: result.sid };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}
```

### 5. Create Notification Module (`src/notifications/index.ts`)
```typescript
import { sendTelegram } from './channels/telegram.js';
import { sendMacOSNotification } from './channels/macos.js';
import { sendSms } from './channels/twilio.js';
import { NotificationRateLimiter } from './rate-limiter.js';

export function loadNotificationConfig(): NotificationConfig {
  const config: NotificationConfig = {
    cooldownMs: parseInt(process.env.NOTIFY_COOLDOWN_MINUTES ?? '30') * 60 * 1000,
  };

  // Telegram
  if (process.env.NOTIFY_TELEGRAM_ENABLED === 'true') {
    if (process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID) {
      config.telegram = {
        enabled: true,
        botToken: process.env.TELEGRAM_BOT_TOKEN,
        chatId: process.env.TELEGRAM_CHAT_ID,
      };
    } else {
      logger.warn('Telegram notifications enabled but missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID');
    }
  }

  // macOS (auto-enable on Mac unless explicitly disabled)
  if (process.platform === 'darwin' && process.env.NOTIFY_MACOS_ENABLED !== 'false') {
    config.macos = { enabled: true };
  }

  // Twilio SMS
  if (process.env.NOTIFY_SMS_ENABLED === 'true') {
    const required = ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_FROM_NUMBER', 'NOTIFY_TO_NUMBER'];
    if (required.every(key => process.env[key])) {
      config.twilio = {
        enabled: true,
        accountSid: process.env.TWILIO_ACCOUNT_SID!,
        authToken: process.env.TWILIO_AUTH_TOKEN!,
        fromNumber: process.env.TWILIO_FROM_NUMBER!,
        toNumber: process.env.NOTIFY_TO_NUMBER!,
      };
    } else {
      logger.warn('SMS notifications enabled but missing required Twilio credentials');
    }
  }

  return config;
}

export function createNotifier(config: NotificationConfig) {
  const rateLimiter = new NotificationRateLimiter(config.cooldownMs);

  return async function notify(
    event: NotificationEvent,
    message: string
  ): Promise<NotificationResult> {
    const channels: NotificationChannel[] = [];
    const errors: { channel: NotificationChannel; error: string }[] = [];

    // Check rate limit
    if (!rateLimiter.canNotify(event)) {
      return { sent: false, channels: [], errors: [], suppressed: true, reason: 'rate limited' };
    }

    // Try Telegram
    if (config.telegram?.enabled) {
      const result = await sendTelegram(config.telegram, message);
      if (result.success) {
        channels.push('telegram');
      } else {
        errors.push({ channel: 'telegram', error: result.error! });
      }
    }

    // Try macOS
    if (config.macos?.enabled) {
      const result = await sendMacOSNotification('ChatGPT Indexer', message);
      if (result.success) {
        channels.push('macos');
      } else {
        errors.push({ channel: 'macos', error: result.error! });
      }
    }

    // Try Twilio SMS
    if (config.twilio?.enabled) {
      const result = await sendSms(config.twilio, message);
      if (result.success) {
        channels.push('sms');
      } else {
        errors.push({ channel: 'sms', error: result.error! });
      }
    }

    // Record notification if at least one channel succeeded
    if (channels.length > 0) {
      rateLimiter.recordNotification(event);
    }

    return {
      sent: channels.length > 0,
      channels,
      errors,
    };
  };
}
```

### 6. Add Auto-Recovery to Auth Recovery (`src/auth/recovery.ts`)
```typescript
// Before throwing AuthRecoveryError, try:
// 1. Refresh the page
// 2. Wait briefly
// 3. Re-check auth state
// 4. If still not authenticated, then throw

export async function recoverFromAuthExpiration(
  page: Page,
  onProgress: ProgressCallback,
  attemptAutoRecovery = true
): Promise<void> {
  // Existing bring-to-front and wait logic...

  if (!authenticated && attemptAutoRecovery) {
    onProgress('Auto-recovery: attempting page refresh...');
    try {
      await page.reload({ waitUntil: 'networkidle' });
      await page.waitForTimeout(3000);

      const authState = await detectAuthState(page);
      if (authState === AuthState.AUTHENTICATED) {
        onProgress('Auto-recovery successful');
        return;
      }
    } catch (refreshError) {
      onProgress('Auto-recovery failed: could not refresh page');
    }
  }

  throw new AuthRecoveryError(
    'Authentication timeout - user did not re-authenticate within the allowed time'
  );
}
```

### 7. Integrate into Watch Mode (`src/scraper/orchestrator.ts`)
```typescript
import { loadNotificationConfig, createNotifier } from '../notifications/index.js';

export async function runWatchMode(...): Promise<void> {
  // ... existing setup ...

  // Initialize notification system
  const notificationConfig = loadNotificationConfig();
  const notify = createNotifier(notificationConfig);

  const enabledChannels = [
    notificationConfig.telegram?.enabled && 'Telegram',
    notificationConfig.macos?.enabled && 'macOS',
    notificationConfig.twilio?.enabled && 'SMS',
  ].filter(Boolean);

  if (enabledChannels.length > 0) {
    logger.info(`Notifications enabled: ${enabledChannels.join(', ')}`);
  }

  // In the catch block:
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn(`Scan #${scanCount} failed: ${message} - will retry in ${formatInterval(intervalMs)}`);
    await failRun(backends);

    // Send notification for auth failures
    if (message.includes('Authentication timeout')) {
      const notifyResult = await notify(
        'auth_failure',
        `Auth expired. Please re-authenticate. Scan #${scanCount} failed.`
      );

      if (notifyResult.sent) {
        logger.info(`Notification sent via: ${notifyResult.channels.join(', ')}`);
      }
      if (notifyResult.errors.length > 0) {
        for (const err of notifyResult.errors) {
          logger.warn(`Notification failed (${err.channel}): ${err.error}`);
        }
      }
      if (notifyResult.suppressed) {
        logger.debug('Notification suppressed (rate limited)');
      }
    }

    // ... rest of error handling ...
  }
```

## Testing Strategy

### Unit Tests
1. `rate-limiter.test.ts` - Rate limiting logic
2. `telegram.test.ts` - Telegram sending (mocked)
3. `macos.test.ts` - macOS notifications (mocked exec)
4. `twilio.test.ts` - SMS sending (mocked)
5. `index.test.ts` - Config loading, channel routing

### Manual Verification
1. Set up Telegram bot, verify message received
2. On macOS, verify notification appears in Notification Center
3. (Optional) Test Twilio SMS delivery

## Security Considerations

1. **Credentials Storage**: All tokens in environment variables, never in code
2. **Rate Limiting**: Prevents notification spam (default: 1 per 30 min)
3. **No PII in Messages**: Messages contain only operational status

## Rollout

1. All channels opt-in via environment variables
2. macOS auto-enabled on Mac (can disable with `NOTIFY_MACOS_ENABLED=false`)
3. Graceful degradation if credentials missing
4. No breaking changes to existing behavior

## Quick Start (Telegram)

```bash
# 1. Create bot: Message @BotFather on Telegram, type /newbot
# 2. Copy the bot token you receive
# 3. Create a group and add your bot
# 4. Get chat_id:
curl "https://api.telegram.org/bot<YOUR_TOKEN>/getUpdates"

# 5. Add to your environment:
export NOTIFY_TELEGRAM_ENABLED=true
export TELEGRAM_BOT_TOKEN="123456789:ABCdefGHIjklMNOpqrsTUVwxyz"
export TELEGRAM_CHAT_ID="-1001234567890"

# 6. Run watch mode - you'll get Telegram notifications on auth failures
chatgpt-indexer run --watch
```

## Sources
- [Telegram Bot API](https://core.telegram.org/bots)
- [Telegram Push Notifications Guide](https://respond.io/blog/telegram-push-notifications)
- [node-notifier for macOS](https://github.com/mikaelbr/node-notifier)
- [macOS Notification via osascript](https://gist.github.com/5818959/76db10ea601ebd137b4f76940ab0e03c)

/**
 * Notification system for alerting users of auth failures and other events.
 *
 * Supports multiple channels:
 * - Telegram (recommended - free)
 * - macOS Notification Center (auto-enabled on Mac)
 * - Twilio SMS (optional - paid)
 *
 * Configuration via environment variables - see loadNotificationConfig().
 */

import { sendTelegram } from './channels/telegram.js';
import { sendMacOSNotification } from './channels/macos.js';
import { sendSms } from './channels/twilio.js';
import { NotificationRateLimiter } from './rate-limiter.js';
import { logger } from '../utils/logger.js';
import type {
  NotificationConfig,
  NotificationResult,
  NotificationEvent,
  NotificationChannel,
  Notifier,
} from './types.js';

export type { NotificationConfig, NotificationResult, NotificationEvent, Notifier };

/** Default cooldown between notifications (30 minutes) */
const DEFAULT_COOLDOWN_MINUTES = 30;

/**
 * Load notification configuration from environment variables.
 *
 * Environment variables:
 * - NOTIFY_TELEGRAM_ENABLED: Enable Telegram (true/false)
 * - TELEGRAM_BOT_TOKEN: Telegram bot token from BotFather
 * - TELEGRAM_CHAT_ID: Chat/group/channel ID to send to
 * - NOTIFY_MACOS_ENABLED: Enable/disable macOS (default: true on Mac)
 * - NOTIFY_SMS_ENABLED: Enable Twilio SMS (true/false)
 * - TWILIO_ACCOUNT_SID: Twilio account SID
 * - TWILIO_AUTH_TOKEN: Twilio auth token
 * - TWILIO_FROM_NUMBER: Twilio phone number (E.164 format)
 * - NOTIFY_TO_NUMBER: Destination phone number (E.164 format)
 * - NOTIFY_COOLDOWN_MINUTES: Min minutes between notifications (default: 30)
 */
export function loadNotificationConfig(): NotificationConfig {
  const cooldownMinutes = parseInt(
    process.env.NOTIFY_COOLDOWN_MINUTES ?? String(DEFAULT_COOLDOWN_MINUTES),
    10
  );

  const config: NotificationConfig = {
    cooldownMs: cooldownMinutes * 60 * 1000,
  };

  // Telegram
  if (process.env.NOTIFY_TELEGRAM_ENABLED === 'true') {
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;

    if (botToken && chatId) {
      config.telegram = {
        enabled: true,
        botToken,
        chatId,
      };
    } else {
      logger.warn(
        'Telegram notifications enabled but missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID'
      );
    }
  }

  // macOS (auto-enable on Mac unless explicitly disabled)
  if (
    process.platform === 'darwin' &&
    process.env.NOTIFY_MACOS_ENABLED !== 'false'
  ) {
    config.macos = { enabled: true };
  }

  // Twilio SMS
  if (process.env.NOTIFY_SMS_ENABLED === 'true') {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const fromNumber = process.env.TWILIO_FROM_NUMBER;
    const toNumber = process.env.NOTIFY_TO_NUMBER;

    if (accountSid && authToken && fromNumber && toNumber) {
      config.twilio = {
        enabled: true,
        accountSid,
        authToken,
        fromNumber,
        toNumber,
      };
    } else {
      logger.warn(
        'SMS notifications enabled but missing required Twilio credentials'
      );
    }
  }

  return config;
}

/**
 * Get a list of enabled notification channels.
 */
export function getEnabledChannels(config: NotificationConfig): string[] {
  const channels: string[] = [];

  if (config.telegram?.enabled) channels.push('Telegram');
  if (config.macos?.enabled) channels.push('macOS');
  if (config.twilio?.enabled) channels.push('SMS');

  return channels;
}

/**
 * Create a notifier function with the given configuration.
 *
 * The notifier handles rate limiting internally.
 * Returns a function that can be called to send notifications.
 */
export function createNotifier(config: NotificationConfig): Notifier {
  const rateLimiter = new NotificationRateLimiter(config.cooldownMs);

  return async function notify(
    event: NotificationEvent,
    message: string
  ): Promise<NotificationResult> {
    const channels: NotificationChannel[] = [];
    const errors: Array<{ channel: NotificationChannel; error: string }> = [];

    // Check if any channel is enabled
    const hasChannels =
      config.telegram?.enabled ||
      config.macos?.enabled ||
      config.twilio?.enabled;

    if (!hasChannels) {
      return {
        sent: false,
        channels: [],
        errors: [],
        reason: 'no notification channels configured',
      };
    }

    // Check rate limit
    if (!rateLimiter.canNotify(event)) {
      const remaining = rateLimiter.getTimeUntilNextNotification(event);
      const remainingMinutes = Math.ceil(remaining / 60000);
      return {
        sent: false,
        channels: [],
        errors: [],
        suppressed: true,
        reason: `rate limited (${remainingMinutes}m until next allowed)`,
      };
    }

    // Try Telegram
    if (config.telegram?.enabled) {
      const result = await sendTelegram(config.telegram, message);
      if (result.success) {
        channels.push('telegram');
      } else if (result.error) {
        errors.push({ channel: 'telegram', error: result.error });
      }
    }

    // Try macOS
    if (config.macos?.enabled) {
      const result = await sendMacOSNotification('ChatGPT Indexer', message);
      if (result.success) {
        channels.push('macos');
      } else if (result.error) {
        errors.push({ channel: 'macos', error: result.error });
      }
    }

    // Try Twilio SMS
    if (config.twilio?.enabled) {
      const result = await sendSms(config.twilio, message);
      if (result.success) {
        channels.push('sms');
      } else if (result.error) {
        errors.push({ channel: 'sms', error: result.error });
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

/**
 * Create a no-op notifier that does nothing.
 * Useful for testing or when notifications are disabled.
 */
export function createNoopNotifier(): Notifier {
  return async () => ({
    sent: false,
    channels: [],
    errors: [],
    reason: 'notifications disabled',
  });
}

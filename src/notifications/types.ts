/**
 * Notification channel types and configuration interfaces.
 */

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

export interface ChannelResult {
  success: boolean;
  error?: string;
  messageId?: string;
}

export interface NotificationResult {
  sent: boolean;
  channels: NotificationChannel[];
  errors: Array<{ channel: NotificationChannel; error: string }>;
  suppressed?: boolean;
  reason?: string;
}

export type NotificationEvent =
  | 'auth_failure'
  | 'auth_recovered'
  | 'scan_complete'
  | 'critical_error';

export type Notifier = (
  event: NotificationEvent,
  message: string
) => Promise<NotificationResult>;

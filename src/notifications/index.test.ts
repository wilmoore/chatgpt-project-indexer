import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  loadNotificationConfig,
  createNotifier,
  getEnabledChannels,
  createNoopNotifier,
} from './index.js';

// Mock the channel modules
vi.mock('./channels/telegram.js', () => ({
  sendTelegram: vi.fn(),
}));

vi.mock('./channels/macos.js', () => ({
  sendMacOSNotification: vi.fn(),
}));

vi.mock('./channels/twilio.js', () => ({
  sendSms: vi.fn(),
}));

vi.mock('../utils/logger.js', () => ({
  logger: {
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}));

import { sendTelegram } from './channels/telegram.js';
import { sendMacOSNotification } from './channels/macos.js';
import { sendSms } from './channels/twilio.js';

describe('loadNotificationConfig', () => {
  const originalEnv = process.env;
  const originalPlatform = process.platform;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
    // Delete notification-related env vars
    delete process.env.NOTIFY_TELEGRAM_ENABLED;
    delete process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.TELEGRAM_CHAT_ID;
    delete process.env.NOTIFY_MACOS_ENABLED;
    delete process.env.NOTIFY_SMS_ENABLED;
    delete process.env.TWILIO_ACCOUNT_SID;
    delete process.env.TWILIO_AUTH_TOKEN;
    delete process.env.TWILIO_FROM_NUMBER;
    delete process.env.NOTIFY_TO_NUMBER;
    delete process.env.NOTIFY_COOLDOWN_MINUTES;
  });

  afterEach(() => {
    process.env = originalEnv;
    Object.defineProperty(process, 'platform', {
      value: originalPlatform,
    });
  });

  it('should return default cooldown when not configured', () => {
    Object.defineProperty(process, 'platform', {
      value: 'linux',
    });

    const config = loadNotificationConfig();

    expect(config.cooldownMs).toBe(30 * 60 * 1000); // 30 minutes
  });

  it('should use custom cooldown when configured', () => {
    process.env.NOTIFY_COOLDOWN_MINUTES = '10';
    Object.defineProperty(process, 'platform', {
      value: 'linux',
    });

    const config = loadNotificationConfig();

    expect(config.cooldownMs).toBe(10 * 60 * 1000);
  });

  it('should configure Telegram when enabled with credentials', () => {
    process.env.NOTIFY_TELEGRAM_ENABLED = 'true';
    process.env.TELEGRAM_BOT_TOKEN = 'test-token';
    process.env.TELEGRAM_CHAT_ID = '-123456';
    Object.defineProperty(process, 'platform', {
      value: 'linux',
    });

    const config = loadNotificationConfig();

    expect(config.telegram).toEqual({
      enabled: true,
      botToken: 'test-token',
      chatId: '-123456',
    });
  });

  it('should not configure Telegram when missing credentials', () => {
    process.env.NOTIFY_TELEGRAM_ENABLED = 'true';
    // Missing bot token and chat ID
    Object.defineProperty(process, 'platform', {
      value: 'linux',
    });

    const config = loadNotificationConfig();

    expect(config.telegram).toBeUndefined();
  });

  it('should auto-enable macOS on darwin platform', () => {
    Object.defineProperty(process, 'platform', {
      value: 'darwin',
    });

    const config = loadNotificationConfig();

    expect(config.macos).toEqual({ enabled: true });
  });

  it('should not enable macOS on non-darwin platform', () => {
    Object.defineProperty(process, 'platform', {
      value: 'linux',
    });

    const config = loadNotificationConfig();

    expect(config.macos).toBeUndefined();
  });

  it('should allow disabling macOS on darwin', () => {
    Object.defineProperty(process, 'platform', {
      value: 'darwin',
    });
    process.env.NOTIFY_MACOS_ENABLED = 'false';

    const config = loadNotificationConfig();

    expect(config.macos).toBeUndefined();
  });

  it('should configure Twilio when enabled with credentials', () => {
    process.env.NOTIFY_SMS_ENABLED = 'true';
    process.env.TWILIO_ACCOUNT_SID = 'AC123';
    process.env.TWILIO_AUTH_TOKEN = 'token';
    process.env.TWILIO_FROM_NUMBER = '+1234567890';
    process.env.NOTIFY_TO_NUMBER = '+0987654321';
    Object.defineProperty(process, 'platform', {
      value: 'linux',
    });

    const config = loadNotificationConfig();

    expect(config.twilio).toEqual({
      enabled: true,
      accountSid: 'AC123',
      authToken: 'token',
      fromNumber: '+1234567890',
      toNumber: '+0987654321',
    });
  });
});

describe('getEnabledChannels', () => {
  it('should return empty array when no channels enabled', () => {
    const channels = getEnabledChannels({ cooldownMs: 60000 });
    expect(channels).toEqual([]);
  });

  it('should return enabled channels', () => {
    const channels = getEnabledChannels({
      telegram: { enabled: true, botToken: 'x', chatId: 'y' },
      macos: { enabled: true },
      cooldownMs: 60000,
    });

    expect(channels).toContain('Telegram');
    expect(channels).toContain('macOS');
  });
});

describe('createNotifier', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should return not sent when no channels configured', async () => {
    const notify = createNotifier({ cooldownMs: 60000 });

    const result = await notify('auth_failure', 'Test');

    expect(result.sent).toBe(false);
    expect(result.reason).toBe('no notification channels configured');
  });

  it('should send via Telegram when configured', async () => {
    vi.mocked(sendTelegram).mockResolvedValue({ success: true, messageId: '123' });

    const notify = createNotifier({
      telegram: { enabled: true, botToken: 'x', chatId: 'y' },
      cooldownMs: 60000,
    });

    const result = await notify('auth_failure', 'Test message');

    expect(result.sent).toBe(true);
    expect(result.channels).toContain('telegram');
    expect(sendTelegram).toHaveBeenCalledWith(
      { enabled: true, botToken: 'x', chatId: 'y' },
      'Test message'
    );
  });

  it('should send via macOS when configured', async () => {
    vi.mocked(sendMacOSNotification).mockResolvedValue({ success: true });

    const notify = createNotifier({
      macos: { enabled: true },
      cooldownMs: 60000,
    });

    const result = await notify('auth_failure', 'Test message');

    expect(result.sent).toBe(true);
    expect(result.channels).toContain('macos');
    expect(sendMacOSNotification).toHaveBeenCalledWith(
      'ChatGPT Indexer',
      'Test message'
    );
  });

  it('should send via multiple channels', async () => {
    vi.mocked(sendTelegram).mockResolvedValue({ success: true });
    vi.mocked(sendMacOSNotification).mockResolvedValue({ success: true });

    const notify = createNotifier({
      telegram: { enabled: true, botToken: 'x', chatId: 'y' },
      macos: { enabled: true },
      cooldownMs: 60000,
    });

    const result = await notify('auth_failure', 'Test');

    expect(result.sent).toBe(true);
    expect(result.channels).toContain('telegram');
    expect(result.channels).toContain('macos');
  });

  it('should collect errors from failed channels', async () => {
    vi.mocked(sendTelegram).mockResolvedValue({
      success: false,
      error: 'API error',
    });

    const notify = createNotifier({
      telegram: { enabled: true, botToken: 'x', chatId: 'y' },
      cooldownMs: 60000,
    });

    const result = await notify('auth_failure', 'Test');

    expect(result.sent).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toEqual({
      channel: 'telegram',
      error: 'API error',
    });
  });

  it('should enforce rate limiting', async () => {
    vi.mocked(sendTelegram).mockResolvedValue({ success: true });

    const notify = createNotifier({
      telegram: { enabled: true, botToken: 'x', chatId: 'y' },
      cooldownMs: 60000,
    });

    // First notification should succeed
    const result1 = await notify('auth_failure', 'Test 1');
    expect(result1.sent).toBe(true);

    // Second notification should be suppressed
    const result2 = await notify('auth_failure', 'Test 2');
    expect(result2.sent).toBe(false);
    expect(result2.suppressed).toBe(true);

    // After cooldown, notification should succeed again
    vi.advanceTimersByTime(60001);
    const result3 = await notify('auth_failure', 'Test 3');
    expect(result3.sent).toBe(true);
  });

  it('should track rate limiting per event type', async () => {
    vi.mocked(sendTelegram).mockResolvedValue({ success: true });

    const notify = createNotifier({
      telegram: { enabled: true, botToken: 'x', chatId: 'y' },
      cooldownMs: 60000,
    });

    await notify('auth_failure', 'Test 1');

    // Different event should not be rate limited
    const result = await notify('scan_complete', 'Test 2');
    expect(result.sent).toBe(true);
  });
});

describe('createNoopNotifier', () => {
  it('should return not sent result', async () => {
    const notify = createNoopNotifier();

    const result = await notify('auth_failure', 'Test');

    expect(result.sent).toBe(false);
    expect(result.reason).toBe('notifications disabled');
    expect(result.channels).toEqual([]);
    expect(result.errors).toEqual([]);
  });
});

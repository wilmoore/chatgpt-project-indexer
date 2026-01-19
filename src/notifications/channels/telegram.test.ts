import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { sendTelegram } from './telegram.js';
import type { TelegramConfig } from '../types.js';

describe('sendTelegram', () => {
  const mockConfig: TelegramConfig = {
    enabled: true,
    botToken: 'test-bot-token',
    chatId: '-123456789',
  };

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('should send message successfully', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ ok: true, result: { message_id: 42 } }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const result = await sendTelegram(mockConfig, 'Test message');

    expect(result.success).toBe(true);
    expect(result.messageId).toBe('42');
    expect(mockFetch).toHaveBeenCalledWith(
      `https://api.telegram.org/bot${mockConfig.botToken}/sendMessage`,
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: mockConfig.chatId,
          text: 'Test message',
          parse_mode: 'HTML',
        }),
      })
    );
  });

  it('should handle API error response', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: () =>
        Promise.resolve({
          ok: false,
          description: 'Bad Request: chat not found',
        }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const result = await sendTelegram(mockConfig, 'Test message');

    expect(result.success).toBe(false);
    expect(result.error).toBe('Bad Request: chat not found');
  });

  it('should handle network error', async () => {
    const mockFetch = vi.fn().mockRejectedValue(new Error('Network error'));
    vi.stubGlobal('fetch', mockFetch);

    const result = await sendTelegram(mockConfig, 'Test message');

    expect(result.success).toBe(false);
    expect(result.error).toBe('Network error');
  });

  it('should handle response without message_id', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ ok: true, result: {} }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const result = await sendTelegram(mockConfig, 'Test message');

    expect(result.success).toBe(true);
    expect(result.messageId).toBeUndefined();
  });
});

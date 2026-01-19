/**
 * Telegram Bot API notification channel.
 * Sends messages via the Telegram Bot API using native fetch.
 *
 * Setup:
 * 1. Message @BotFather on Telegram, type /newbot
 * 2. Follow prompts to name your bot
 * 3. Copy the bot token you receive
 * 4. Create a group or channel and add your bot
 * 5. Get chat_id via: https://api.telegram.org/bot<TOKEN>/getUpdates
 */

import type { TelegramConfig, ChannelResult } from '../types.js';

/**
 * Send a message via Telegram Bot API.
 */
export async function sendTelegram(
  config: TelegramConfig,
  message: string
): Promise<ChannelResult> {
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

    const data = (await response.json()) as {
      ok: boolean;
      description?: string;
      result?: { message_id: number };
    };

    if (!response.ok || !data.ok) {
      return {
        success: false,
        error: data.description ?? `HTTP ${response.status}`,
      };
    }

    return {
      success: true,
      messageId: data.result?.message_id?.toString(),
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

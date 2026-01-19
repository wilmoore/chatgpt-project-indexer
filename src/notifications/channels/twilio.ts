/**
 * Twilio SMS notification channel.
 * Uses the Twilio REST API directly via native fetch (no SDK required).
 *
 * Setup:
 * 1. Create Twilio account at twilio.com
 * 2. Get Account SID and Auth Token from Console
 * 3. Purchase a phone number
 * 4. Set environment variables
 */

import type { TwilioConfig, ChannelResult } from '../types.js';

/**
 * Send an SMS via Twilio API.
 */
export async function sendSms(
  config: TwilioConfig,
  message: string
): Promise<ChannelResult> {
  const url = `https://api.twilio.com/2010-04-01/Accounts/${config.accountSid}/Messages.json`;

  const auth = Buffer.from(`${config.accountSid}:${config.authToken}`).toString(
    'base64'
  );

  const body = new URLSearchParams({
    To: config.toNumber,
    From: config.fromNumber,
    Body: message.slice(0, 160), // SMS character limit
  });

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
    });

    const data = (await response.json()) as {
      sid?: string;
      message?: string;
      code?: number;
    };

    if (!response.ok) {
      return {
        success: false,
        error: data.message ?? `HTTP ${response.status}`,
      };
    }

    return {
      success: true,
      messageId: data.sid,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

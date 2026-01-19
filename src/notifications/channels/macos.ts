/**
 * macOS native notification channel.
 * Uses osascript to display notifications in Notification Center.
 *
 * Only works on macOS (darwin platform).
 * No setup required - uses built-in AppleScript.
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import type { ChannelResult } from '../types.js';

const execAsync = promisify(exec);

/**
 * Send a notification via macOS Notification Center.
 */
export async function sendMacOSNotification(
  title: string,
  message: string
): Promise<ChannelResult> {
  if (process.platform !== 'darwin') {
    return {
      success: false,
      error: 'macOS notifications only available on macOS',
    };
  }

  // Escape special characters for AppleScript
  const escapedTitle = escapeForAppleScript(title);
  const escapedMessage = escapeForAppleScript(message);

  const script = `display notification "${escapedMessage}" with title "${escapedTitle}" sound name "Glass"`;

  try {
    await execAsync(`osascript -e '${script}'`);
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Escape a string for use in AppleScript.
 */
function escapeForAppleScript(str: string): string {
  return str
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/'/g, "'\\''");
}

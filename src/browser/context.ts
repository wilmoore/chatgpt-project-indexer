import { chromium, BrowserContext } from 'playwright';
import { CONFIG } from '../config/constants.js';
import fs from 'fs/promises';
import path from 'path';

export interface ContextOptions {
  headless: boolean;
}

/**
 * Ensures the user data directory exists
 */
async function ensureUserDataDir(): Promise<void> {
  await fs.mkdir(CONFIG.USER_DATA_DIR, { recursive: true });
}

/**
 * Checks if a previous session exists (user has logged in before)
 */
export async function hasExistingSession(): Promise<boolean> {
  try {
    const cookiesPath = path.join(CONFIG.USER_DATA_DIR, 'Default', 'Cookies');
    await fs.access(cookiesPath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Creates a persistent browser context that preserves cookies and session
 * across runs. Uses a dedicated user data directory.
 */
export async function createPersistentContext(
  options: ContextOptions
): Promise<BrowserContext> {
  await ensureUserDataDir();

  const context = await chromium.launchPersistentContext(CONFIG.USER_DATA_DIR, {
    headless: options.headless,
    channel: 'chromium',
    viewport: {
      width: CONFIG.VIEWPORT.WIDTH,
      height: CONFIG.VIEWPORT.HEIGHT,
    },
    args: [
      // Reduce automation detection
      '--disable-blink-features=AutomationControlled',
    ],
  });

  return context;
}

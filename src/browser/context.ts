import { chromium, BrowserContext } from 'playwright';
import { CONFIG } from '../config/constants.js';
import { logger } from '../utils/logger.js';
import fs from 'fs/promises';
import { constants as fsConstants } from 'fs';
import path from 'path';

export interface ContextOptions {
  headless: boolean;
  onProgress?: (msg: string) => void;
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
    logger.debug(`Checking for existing session at: ${cookiesPath}`);
    await fs.access(cookiesPath);
    logger.debug('Existing session found');
    return true;
  } catch {
    logger.debug('No existing session found');
    return false;
  }
}

/**
 * Checks if an imported session state file is waiting to be applied
 */
export async function hasImportedState(): Promise<boolean> {
  try {
    logger.debug(`Checking for imported state at: ${CONFIG.AUTH.IMPORTED_FILE}`);
    await fs.access(CONFIG.AUTH.IMPORTED_FILE, fsConstants.R_OK);
    logger.debug('Imported state file found');
    return true;
  } catch {
    logger.debug('No imported state file found');
    return false;
  }
}

/**
 * Applies imported storage state to the persistent context
 * and removes the import file (one-time use)
 */
async function applyImportedState(
  context: BrowserContext,
  onProgress: (msg: string) => void
): Promise<void> {
  try {
    const content = await fs.readFile(CONFIG.AUTH.IMPORTED_FILE, 'utf-8');
    const storageState = JSON.parse(content);

    if (storageState.cookies && Array.isArray(storageState.cookies)) {
      // Add cookies to the context
      await context.addCookies(storageState.cookies);
      onProgress(`Applied ${storageState.cookies.length} cookies from imported session`);
    }

    // Remove the import file (one-time use)
    await fs.unlink(CONFIG.AUTH.IMPORTED_FILE);
    onProgress('Imported session file consumed');
  } catch (error) {
    onProgress(`Warning: Failed to apply imported session: ${error instanceof Error ? error.message : 'unknown error'}`);
  }
}

/**
 * Creates a persistent browser context that preserves cookies and session
 * across runs. Uses a dedicated user data directory.
 *
 * If an imported session state file exists, it will be applied to the
 * context and then deleted (one-time use).
 */
export async function createPersistentContext(
  options: ContextOptions
): Promise<BrowserContext> {
  const onProgress = options.onProgress || (() => {});
  await ensureUserDataDir();

  logger.debug(`User data directory: ${CONFIG.USER_DATA_DIR}`);
  logger.debug(`Headless mode: ${options.headless}`);

  // Check if there's an imported session to apply
  const hasImported = await hasImportedState();
  if (hasImported) {
    onProgress('Found imported session state, will apply after launch...');
  }

  logger.debug('Launching persistent browser context...');
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
  logger.debug('Browser context launched successfully');

  // Apply imported state if present
  if (hasImported) {
    await applyImportedState(context, onProgress);
  }

  return context;
}

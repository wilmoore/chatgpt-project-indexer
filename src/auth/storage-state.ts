/**
 * Storage State Authentication
 *
 * Enables CLI-based authentication via portable storage state files.
 * This allows authenticating on a machine with a browser and
 * transferring the session to a headless remote server.
 */

import { chromium } from 'playwright';
import fs from 'fs/promises';
import { constants as fsConstants } from 'fs';
import path from 'path';
import { CONFIG } from '../config/constants.js';
import { detectAuthState } from './detector.js';
import { AuthState } from '../types/index.js';

export interface StorageState {
  cookies: Array<{
    name: string;
    value: string;
    domain: string;
    path: string;
    expires: number;
    httpOnly: boolean;
    secure: boolean;
    sameSite: 'Strict' | 'Lax' | 'None';
  }>;
  origins: Array<{
    origin: string;
    localStorage: Array<{
      name: string;
      value: string;
    }>;
  }>;
}

/** File permission for auth files (owner read/write only) */
const SECURE_FILE_MODE = 0o600;

/**
 * Check if a file has insecure permissions (group or world readable)
 */
export async function checkFilePermissions(
  filePath: string
): Promise<{ secure: boolean; mode: number }> {
  try {
    const stats = await fs.stat(filePath);
    const mode = stats.mode & 0o777;
    // Check if group or others have any permissions
    const insecure = (mode & 0o077) !== 0;
    return { secure: !insecure, mode };
  } catch {
    return { secure: true, mode: 0 }; // File doesn't exist yet
  }
}

/**
 * Ensure base directory exists
 */
async function ensureBaseDir(): Promise<void> {
  await fs.mkdir(CONFIG.BASE_DIR, { recursive: true });
}

/**
 * Interactive login flow - opens browser for user to authenticate
 * Exports session state to a portable JSON file AND populates persistent context
 */
export async function loginAndExport(
  outputPath: string = CONFIG.AUTH.STATE_FILE,
  onProgress: (msg: string) => void = console.log
): Promise<string> {
  await ensureBaseDir();
  onProgress('Launching browser for authentication...');

  // Launch with persistent context so cookies are saved directly
  const context = await chromium.launchPersistentContext(CONFIG.USER_DATA_DIR, {
    headless: false,
    channel: 'chromium',
    viewport: {
      width: CONFIG.VIEWPORT.WIDTH,
      height: CONFIG.VIEWPORT.HEIGHT,
    },
    args: ['--disable-blink-features=AutomationControlled'],
  });

  const page = context.pages()[0] || (await context.newPage());
  await page.goto(CONFIG.CHATGPT_URL);

  onProgress('Please log in to ChatGPT in the browser window.');
  onProgress('The window will close automatically once authenticated.');

  // Wait for authentication (poll for up to 5 minutes)
  const startTime = Date.now();
  const timeoutMs = CONFIG.TIMEOUTS.AUTH_RECOVERY;

  while (Date.now() - startTime < timeoutMs) {
    const authState = await detectAuthState(page);

    if (authState === AuthState.AUTHENTICATED) {
      onProgress('Authentication detected! Exporting session...');
      break;
    }

    await page.waitForTimeout(CONFIG.TIMEOUTS.AUTH_POLL_INTERVAL);
  }

  // Verify final state
  const finalState = await detectAuthState(page);
  if (finalState !== AuthState.AUTHENTICATED) {
    await context.close();
    throw new Error('Authentication timeout - please try again');
  }

  // Export storage state to portable file
  await context.storageState({ path: outputPath });

  // Set restrictive permissions on auth file
  await fs.chmod(outputPath, SECURE_FILE_MODE);

  await context.close();

  onProgress(`Session saved to persistent context`);
  onProgress(`Session exported to: ${outputPath}`);
  onProgress('You can transfer this file to a remote server for headless operation.');

  return outputPath;
}

/**
 * Export storage state from existing persistent context
 */
export async function exportFromPersistent(
  outputPath: string = CONFIG.AUTH.STATE_FILE,
  onProgress: (msg: string) => void = console.log
): Promise<string> {
  await ensureBaseDir();
  onProgress('Loading existing session...');

  const context = await chromium.launchPersistentContext(CONFIG.USER_DATA_DIR, {
    headless: true,
    channel: 'chromium',
  });

  const page = context.pages()[0] || (await context.newPage());
  await page.goto(CONFIG.CHATGPT_URL, { waitUntil: 'domcontentloaded' });

  // Check if authenticated
  const authState = await detectAuthState(page);
  if (authState !== AuthState.AUTHENTICATED) {
    await context.close();
    throw new Error(
      'No authenticated session found. Run "auth login" first.'
    );
  }

  // Export storage state
  await context.storageState({ path: outputPath });
  await fs.chmod(outputPath, SECURE_FILE_MODE);

  await context.close();

  onProgress(`Session exported to: ${outputPath}`);
  return outputPath;
}

/**
 * Import storage state for use by persistent context
 * The imported state will be consumed on next browser launch
 */
export async function importToPersistent(
  inputPath: string,
  onProgress: (msg: string) => void = console.log
): Promise<void> {
  await ensureBaseDir();
  onProgress(`Importing session from: ${inputPath}`);

  // Resolve to absolute path
  const absolutePath = path.resolve(inputPath);

  // Validate file exists
  try {
    await fs.access(absolutePath, fsConstants.R_OK);
  } catch {
    throw new Error(`Auth file not found or not readable: ${absolutePath}`);
  }

  // Check file permissions and warn if insecure
  const { secure, mode } = await checkFilePermissions(absolutePath);
  if (!secure) {
    const modeStr = mode.toString(8).padStart(3, '0');
    onProgress(
      `Warning: Auth file has insecure permissions (${modeStr}). ` +
        `Session tokens may be exposed. Consider: chmod 600 "${absolutePath}"`
    );
  }

  // Read and validate storage state
  const content = await fs.readFile(absolutePath, 'utf-8');
  let storageState: StorageState;

  try {
    storageState = JSON.parse(content) as StorageState;
  } catch {
    throw new Error('Invalid auth file format: not valid JSON');
  }

  if (!storageState.cookies || !Array.isArray(storageState.cookies)) {
    throw new Error('Invalid auth file format: missing cookies array');
  }

  // Check for ChatGPT cookies
  const chatgptCookies = storageState.cookies.filter(
    (c) => c.domain.includes('chatgpt.com') || c.domain.includes('openai.com')
  );

  if (chatgptCookies.length === 0) {
    throw new Error('No ChatGPT session cookies found in auth file');
  }

  onProgress(`Found ${chatgptCookies.length} session cookies`);

  // Validate by creating a temporary context and checking auth
  onProgress('Validating session...');
  const browser = await chromium.launch({
    headless: true,
    channel: 'chromium',
  });

  const context = await browser.newContext({
    storageState: absolutePath,
    viewport: {
      width: CONFIG.VIEWPORT.WIDTH,
      height: CONFIG.VIEWPORT.HEIGHT,
    },
  });

  const page = await context.newPage();
  await page.goto(CONFIG.CHATGPT_URL, { waitUntil: 'domcontentloaded' });

  const authState = await detectAuthState(page);
  await browser.close();

  if (authState !== AuthState.AUTHENTICATED) {
    throw new Error(
      'Imported session is not valid or has expired. Please run "auth login" again on a machine with a browser.'
    );
  }

  // Copy to imported state location for consumption by persistent context
  await fs.copyFile(absolutePath, CONFIG.AUTH.IMPORTED_FILE);
  await fs.chmod(CONFIG.AUTH.IMPORTED_FILE, SECURE_FILE_MODE);

  onProgress('Session imported and validated successfully');
  onProgress('The session will be applied on next "run" command.');
}

/**
 * Check current authentication status
 */
export async function checkAuthStatus(
  onProgress: (msg: string) => void = console.log
): Promise<AuthState> {
  onProgress('Checking authentication status...');

  // Check if there's an imported state waiting to be applied
  try {
    await fs.access(CONFIG.AUTH.IMPORTED_FILE, fsConstants.R_OK);
    onProgress('Note: Imported session file found (will be applied on next run)');
  } catch {
    // No imported file, that's fine
  }

  let context;
  try {
    context = await chromium.launchPersistentContext(CONFIG.USER_DATA_DIR, {
      headless: true,
      channel: 'chromium',
    });
  } catch (error) {
    onProgress('Failed to launch browser');
    return AuthState.UNKNOWN;
  }

  const page = context.pages()[0] || (await context.newPage());

  try {
    await page.goto(CONFIG.CHATGPT_URL, {
      waitUntil: 'domcontentloaded',
      timeout: 30_000,
    });
  } catch {
    await context.close();
    onProgress('Failed to connect to ChatGPT');
    return AuthState.UNKNOWN;
  }

  const authState = await detectAuthState(page);
  await context.close();

  switch (authState) {
    case AuthState.AUTHENTICATED:
      onProgress('Status: Authenticated');
      break;
    case AuthState.LOGIN_REQUIRED:
      onProgress('Status: Login required');
      break;
    case AuthState.SESSION_EXPIRED:
      onProgress('Status: Session expired');
      break;
    default:
      onProgress('Status: Unknown');
  }

  return authState;
}

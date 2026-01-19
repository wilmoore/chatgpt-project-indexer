import { Page } from 'playwright';
import { detectAuthState, waitForAuthentication } from './detector.js';
import { bringToFront } from '../browser/manager.js';
import { AuthState, ProgressCallback } from '../types/index.js';
import { CONFIG } from '../config/constants.js';

export class AuthRecoveryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthRecoveryError';
  }
}

/**
 * Attempts auto-recovery by refreshing the page and checking auth state.
 * Returns true if auto-recovery succeeded, false otherwise.
 */
async function attemptAutoRecovery(
  page: Page,
  onProgress: ProgressCallback
): Promise<boolean> {
  onProgress('Auto-recovery: attempting page refresh...');

  try {
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(3000);

    const authState = await detectAuthState(page);
    if (authState === AuthState.AUTHENTICATED) {
      onProgress('Auto-recovery successful');
      return true;
    }
  } catch (refreshError) {
    onProgress('Auto-recovery failed: could not refresh page');
  }

  return false;
}

/**
 * Handles authentication expiration during enumeration.
 * First attempts auto-recovery via page refresh.
 * If that fails, brings browser to front and waits for user to re-authenticate.
 *
 * @param page - The Playwright page instance
 * @param onProgress - Progress callback for status updates
 * @param skipAutoRecovery - Skip auto-recovery attempt (useful if already tried)
 */
export async function recoverFromAuthExpiration(
  page: Page,
  onProgress: ProgressCallback,
  skipAutoRecovery = false
): Promise<void> {
  // Try auto-recovery first (unless skipped)
  if (!skipAutoRecovery) {
    const recovered = await attemptAutoRecovery(page, onProgress);
    if (recovered) {
      return;
    }
  }

  onProgress('Authentication expired. Please log in to continue.');
  onProgress('Browser window will be brought to front for login.');

  // Bring browser to foreground
  await bringToFront(page);

  onProgress(
    `Waiting for authentication (timeout: ${CONFIG.TIMEOUTS.AUTH_RECOVERY / 1000}s)...`
  );

  const authenticated = await waitForAuthentication(
    page,
    CONFIG.TIMEOUTS.AUTH_RECOVERY
  );

  if (!authenticated) {
    throw new AuthRecoveryError(
      'Authentication timeout - user did not re-authenticate within the allowed time'
    );
  }

  onProgress('Authentication restored. Resuming enumeration.');
}

/**
 * Checks auth state and handles recovery if needed.
 * Returns true if authenticated (possibly after recovery).
 * Throws if recovery fails.
 */
export async function ensureAuthenticated(
  page: Page,
  onProgress: ProgressCallback
): Promise<boolean> {
  const authState = await detectAuthState(page);

  switch (authState) {
    case AuthState.AUTHENTICATED:
      onProgress('Authentication verified');
      return true;

    case AuthState.LOGIN_REQUIRED:
    case AuthState.SESSION_EXPIRED:
    case AuthState.UNKNOWN:
      // For first run or unknown state, prompt for login
      onProgress('Login required. Please log in to ChatGPT in the browser window.');
      await recoverFromAuthExpiration(page, onProgress);
      return true;

    default:
      return false;
  }
}

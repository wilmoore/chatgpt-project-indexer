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
 * Handles authentication expiration during enumeration.
 * Pauses, brings browser to front, waits for user to re-authenticate.
 */
export async function recoverFromAuthExpiration(
  page: Page,
  onProgress: ProgressCallback
): Promise<void> {
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

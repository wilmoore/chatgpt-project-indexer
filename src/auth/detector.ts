import { Page } from 'playwright';
import { AuthState } from '../types/index.js';
import { SELECTORS, AUTH_URL_PATTERNS, CONFIG } from '../config/constants.js';
import { logger } from '../utils/logger.js';

/**
 * Detects the current authentication state by examining
 * URL patterns and DOM indicators.
 */
export async function detectAuthState(page: Page): Promise<AuthState> {
  const url = page.url();
  logger.debug(`Detecting auth state for URL: ${url}`);

  // Check for login page URL patterns
  for (const pattern of AUTH_URL_PATTERNS.LOGIN) {
    if (url.includes(pattern)) {
      logger.debug(`URL matches login pattern: ${pattern}`);
      return AuthState.LOGIN_REQUIRED;
    }
  }

  // Check if on ChatGPT domain
  const isOnChatGPT = AUTH_URL_PATTERNS.AUTHENTICATED.some((pattern) =>
    url.includes(pattern)
  );

  if (!isOnChatGPT) {
    logger.debug('URL not on ChatGPT domain, login required');
    return AuthState.LOGIN_REQUIRED;
  }

  logger.debug('URL is on ChatGPT domain, checking for sidebar...');

  // Try to find authenticated UI indicators (sidebar)
  try {
    for (const selector of SELECTORS.sidebar) {
      const element = page.locator(selector).first();
      try {
        logger.debug(`Trying sidebar selector: ${selector}`);
        await element.waitFor({
          state: 'visible',
          timeout: CONFIG.TIMEOUTS.ELEMENT_WAIT,
        });
        logger.debug(`Sidebar found with selector: ${selector}`);
        return AuthState.AUTHENTICATED;
      } catch {
        logger.debug(`Sidebar not found with selector: ${selector}`);
      }
    }
  } catch {
    // Sidebar not found
  }

  logger.debug('Sidebar not found, checking for login indicators...');

  // Check for login indicators on the page
  for (const selector of SELECTORS.loginIndicators) {
    try {
      logger.debug(`Checking login indicator: ${selector}`);
      const element = page.locator(selector).first();
      const visible = await element.isVisible();
      if (visible) {
        logger.debug(`Login indicator visible: ${selector}`);
        return AuthState.LOGIN_REQUIRED;
      }
    } catch {
      // Continue checking
    }
  }

  logger.debug('Auth state unknown - no clear indicators found');
  return AuthState.UNKNOWN;
}

/**
 * Waits for user to complete authentication.
 * Polls auth state until authenticated or timeout.
 */
export async function waitForAuthentication(
  page: Page,
  timeoutMs: number = CONFIG.TIMEOUTS.AUTH_RECOVERY
): Promise<boolean> {
  const startTime = Date.now();
  const pollInterval = CONFIG.TIMEOUTS.AUTH_POLL_INTERVAL;

  logger.debug(`Waiting for authentication (timeout: ${timeoutMs}ms, poll: ${pollInterval}ms)`);

  while (Date.now() - startTime < timeoutMs) {
    const elapsed = Date.now() - startTime;
    const authState = await detectAuthState(page);

    logger.debug(`Auth poll at ${elapsed}ms: state=${authState}`);

    if (authState === AuthState.AUTHENTICATED) {
      logger.debug('Authentication successful');
      return true;
    }

    await page.waitForTimeout(pollInterval);
  }

  logger.debug(`Authentication timeout after ${timeoutMs}ms`);
  return false;
}

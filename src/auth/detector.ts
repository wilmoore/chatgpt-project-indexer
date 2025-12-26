import { Page } from 'playwright';
import { AuthState } from '../types/index.js';
import { SELECTORS, AUTH_URL_PATTERNS, CONFIG } from '../config/constants.js';

/**
 * Detects the current authentication state by examining
 * URL patterns and DOM indicators.
 */
export async function detectAuthState(page: Page): Promise<AuthState> {
  const url = page.url();

  // Check for login page URL patterns
  for (const pattern of AUTH_URL_PATTERNS.LOGIN) {
    if (url.includes(pattern)) {
      return AuthState.LOGIN_REQUIRED;
    }
  }

  // Check if on ChatGPT domain
  const isOnChatGPT = AUTH_URL_PATTERNS.AUTHENTICATED.some((pattern) =>
    url.includes(pattern)
  );

  if (!isOnChatGPT) {
    return AuthState.LOGIN_REQUIRED;
  }

  // Try to find authenticated UI indicators (sidebar)
  try {
    for (const selector of SELECTORS.sidebar) {
      const element = page.locator(selector).first();
      try {
        await element.waitFor({
          state: 'visible',
          timeout: CONFIG.TIMEOUTS.ELEMENT_WAIT,
        });
        return AuthState.AUTHENTICATED;
      } catch {
        // Try next selector
      }
    }
  } catch {
    // Sidebar not found
  }

  // Check for login indicators on the page
  for (const selector of SELECTORS.loginIndicators) {
    try {
      const element = page.locator(selector).first();
      const visible = await element.isVisible();
      if (visible) {
        return AuthState.LOGIN_REQUIRED;
      }
    } catch {
      // Continue checking
    }
  }

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

  while (Date.now() - startTime < timeoutMs) {
    const authState = await detectAuthState(page);

    if (authState === AuthState.AUTHENTICATED) {
      return true;
    }

    await page.waitForTimeout(pollInterval);
  }

  return false;
}

import { BrowserContext, Page } from 'playwright';
import { createPersistentContext, hasExistingSession } from './context.js';
import { CONFIG } from '../config/constants.js';
import type { ProgressCallback } from '../types/index.js';

export interface BrowserSession {
  context: BrowserContext;
  page: Page;
}

export interface LaunchOptions {
  forceHeadful?: boolean;
  onProgress?: ProgressCallback;
}

/**
 * Launches a browser session with appropriate headless/headful mode.
 *
 * Strategy:
 * - First run (no existing session): Always headful for manual login
 * - Subsequent runs: Headless unless forceHeadful is true
 */
export async function launchBrowser(
  options: LaunchOptions = {}
): Promise<BrowserSession> {
  const { forceHeadful = false, onProgress = console.log } = options;

  const existingSession = await hasExistingSession();

  // Determine headless mode
  let headless: boolean;
  if (forceHeadful) {
    headless = false;
    onProgress('Launching browser in headful mode (forced)');
  } else if (!existingSession) {
    headless = false;
    onProgress('First run detected - launching browser for manual login');
  } else {
    headless = true;
    onProgress('Using existing session - launching in headless mode');
  }

  const context = await createPersistentContext({ headless });

  // Get the first page or create one
  const pages = context.pages();
  const page = pages.length > 0 ? pages[0] : await context.newPage();

  return { context, page };
}

/**
 * Navigates to ChatGPT and waits for initial load
 */
export async function navigateToChatGPT(page: Page): Promise<void> {
  await page.goto(CONFIG.CHATGPT_URL, {
    waitUntil: 'domcontentloaded',
    timeout: CONFIG.TIMEOUTS.PAGE_LOAD,
  });
}

/**
 * Brings the browser window to the foreground
 */
export async function bringToFront(page: Page): Promise<void> {
  await page.bringToFront();
}

/**
 * Closes the browser context gracefully
 */
export async function closeBrowser(context: BrowserContext): Promise<void> {
  await context.close();
}

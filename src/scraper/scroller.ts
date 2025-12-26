import { Page, Locator } from 'playwright';
import { SELECTORS, CONFIG } from '../config/constants.js';
import { ScrollProgress, ProgressCallback } from '../types/index.js';

/**
 * Gets all visible project items in the container
 */
export async function getProjectItems(container: Locator): Promise<Locator> {
  // Try each selector until we find project items
  for (const selector of SELECTORS.projectItem) {
    const items = container.locator(selector);
    const count = await items.count();
    if (count > 0) {
      return items;
    }
  }

  // Return empty locator if no items found
  return container.locator(SELECTORS.projectItem[0]);
}

/**
 * Counts the current number of project items
 */
export async function countProjectItems(container: Locator): Promise<number> {
  const items = await getProjectItems(container);
  return items.count();
}

/**
 * Scrolls the container until all projects are loaded.
 * Uses a stability detection strategy: scroll is exhausted when
 * the item count remains stable for STABILITY_THRESHOLD iterations.
 */
export async function scrollUntilExhausted(
  page: Page,
  container: Locator,
  onProgress: ProgressCallback
): Promise<number> {
  let previousCount = 0;
  let stableIterations = 0;
  const stabilityThreshold = CONFIG.SCROLL.STABILITY_THRESHOLD;

  onProgress('Starting infinite scroll enumeration...');

  while (stableIterations < stabilityThreshold) {
    // Hover over container to prevent auto-dismiss
    await container.hover();

    // Scroll down
    await page.mouse.wheel(0, CONFIG.SCROLL.DELTA_Y);

    // Wait for potential lazy loading
    await page.waitForTimeout(CONFIG.DELAYS.AFTER_SCROLL);

    // Count current items
    const currentCount = await countProjectItems(container);
    const newItems = currentCount - previousCount;

    if (newItems === 0) {
      stableIterations++;
    } else {
      stableIterations = 0;
      onProgress(`Found ${currentCount} projects (+${newItems} new)`);
    }

    previousCount = currentCount;
  }

  onProgress(`Scroll complete. Total projects found: ${previousCount}`);
  return previousCount;
}

/**
 * Scrolls with progress callback for detailed tracking
 */
export async function scrollWithProgress(
  page: Page,
  container: Locator,
  onProgress: (progress: ScrollProgress) => void
): Promise<void> {
  let previousCount = 0;
  let stableIterations = 0;
  const stabilityThreshold = CONFIG.SCROLL.STABILITY_THRESHOLD;

  while (stableIterations < stabilityThreshold) {
    // Hover to prevent dismiss
    await container.hover();

    // Scroll
    await page.mouse.wheel(0, CONFIG.SCROLL.DELTA_Y);
    await page.waitForTimeout(CONFIG.DELAYS.AFTER_SCROLL);

    // Count items
    const currentCount = await countProjectItems(container);
    const newItems = currentCount - previousCount;

    if (newItems === 0) {
      stableIterations++;
    } else {
      stableIterations = 0;
    }

    onProgress({
      totalItems: currentCount,
      newItemsThisPass: newItems,
      isExhausted: stableIterations >= stabilityThreshold,
    });

    previousCount = currentCount;
  }
}

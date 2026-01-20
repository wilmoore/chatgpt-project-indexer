import { Page, Locator } from 'playwright';
import { SELECTORS, CONFIG } from '../config/constants.js';
import { ScrollProgress, ProgressCallback } from '../types/index.js';

/**
 * Gets all visible project items on the page (not just within container)
 */
export async function getProjectItems(page: Page): Promise<Locator> {
  // Try each selector until we find project items
  for (const selector of SELECTORS.projectItem) {
    const items = page.locator(selector);
    const count = await items.count();
    if (count > 0) {
      return items;
    }
  }

  // Return empty locator if no items found
  return page.locator(SELECTORS.projectItem[0]);
}

/**
 * Counts the current number of project items
 */
export async function countProjectItems(page: Page): Promise<number> {
  const items = await getProjectItems(page);
  return items.count();
}

/**
 * Scrolls a popup until all projects are loaded via infinite scroll.
 * CRITICAL: Cursor must stay inside popup or it will close.
 */
export async function scrollPopupUntilExhausted(
  page: Page,
  popup: Locator,
  onProgress: ProgressCallback
): Promise<number> {
  let previousCount = 0;
  let stableIterations = 0;
  const stabilityThreshold = 10; // More iterations to be sure we're at the end
  let scrollAttempts = 0;
  const maxScrollAttempts = 500; // Large limit for 100+ items

  // Count projects within the popup
  const countPopupProjects = async () => {
    return popup.locator('a[href$="/project"]').count();
  };

  // Get initial count
  const initialCount = await countPopupProjects();
  onProgress(`Scrolling to load all projects (${initialCount} visible so far)...`);

  if (initialCount === 0) {
    onProgress('No projects found in popup');
    return 0;
  }

  previousCount = initialCount;

  // Get popup bounding box to keep cursor inside
  const box = await popup.boundingBox();
  if (!box) {
    onProgress('Could not get popup dimensions');
    return initialCount;
  }

  // Position cursor near bottom of popup (where scroll triggers load)
  const centerX = box.x + box.width / 2;
  const bottomY = box.y + box.height - 50; // Near bottom for scroll trigger
  await page.mouse.move(centerX, bottomY);

  while (stableIterations < stabilityThreshold && scrollAttempts < maxScrollAttempts) {
    scrollAttempts++;

    // Aggressive scroll - multiple wheel events
    await page.mouse.wheel(0, 500);
    await page.waitForTimeout(100);
    await page.mouse.wheel(0, 500);

    // Wait for lazy loading to complete
    await page.waitForTimeout(CONFIG.DELAYS.AFTER_SCROLL);

    // Keep cursor inside by wiggling slightly
    if (scrollAttempts % 2 === 0) {
      await page.mouse.move(centerX + (scrollAttempts % 10) - 5, bottomY);
    }

    // Count current items in popup
    const currentCount = await countPopupProjects();
    const newItems = currentCount - previousCount;

    if (newItems === 0) {
      stableIterations++;
      // Show heartbeat every 3 stable iterations so user knows it's still working
      if (stableIterations % 3 === 0) {
        onProgress(`Still scrolling... ${currentCount} projects found (checking for more)`);
      }
      // Extra aggressive scroll when stuck
      if (stableIterations > 3) {
        await page.mouse.wheel(0, 800);
        await page.waitForTimeout(500);
      }
    } else {
      stableIterations = 0;
      onProgress(`Found ${currentCount} projects (+${newItems} new)`);
    }

    previousCount = currentCount;
  }

  onProgress(`Scroll complete: ${previousCount} projects found in DOM (this is the actual count, not an estimate)`);
  return previousCount;
}

/**
 * Scrolls the sidebar until all projects are loaded (fallback for non-popup UI).
 */
export async function scrollUntilExhausted(
  page: Page,
  container: Locator,
  onProgress: ProgressCallback
): Promise<number> {
  let previousCount = 0;
  let stableIterations = 0;
  const stabilityThreshold = CONFIG.SCROLL.STABILITY_THRESHOLD;
  let scrollAttempts = 0;
  const maxScrollAttempts = 100;

  const initialCount = await countProjectItems(page);
  onProgress(`Scrolling to load all projects (${initialCount} visible so far)...`);

  if (initialCount === 0) {
    onProgress('No projects found in sidebar');
    return 0;
  }

  previousCount = initialCount;

  while (stableIterations < stabilityThreshold && scrollAttempts < maxScrollAttempts) {
    scrollAttempts++;

    await container.hover();
    await page.mouse.wheel(0, CONFIG.SCROLL.DELTA_Y);
    await page.waitForTimeout(CONFIG.DELAYS.AFTER_SCROLL);

    const currentCount = await countProjectItems(page);
    const newItems = currentCount - previousCount;

    if (newItems === 0) {
      stableIterations++;
      // Show heartbeat every 2 stable iterations so user knows it's still working
      if (stableIterations % 2 === 0) {
        onProgress(`Still scrolling... ${currentCount} projects found (checking for more)`);
      }
    } else {
      stableIterations = 0;
      onProgress(`Found ${currentCount} projects (+${newItems} new)`);
    }

    previousCount = currentCount;
  }

  onProgress(`Scroll complete: ${previousCount} projects found in DOM (this is the actual count, not an estimate)`);
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

    // Count items on page
    const currentCount = await countProjectItems(page);
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

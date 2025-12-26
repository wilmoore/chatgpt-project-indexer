import { Page, Locator } from 'playwright';
import { SELECTORS, CONFIG } from '../config/constants.js';
import { ProgressCallback } from '../types/index.js';

export class NavigationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NavigationError';
  }
}

/**
 * Tries multiple selectors until one works, returning the first matching locator.
 */
async function findElement(
  page: Page,
  selectors: readonly string[],
  description: string
): Promise<Locator> {
  for (const selector of selectors) {
    try {
      const locator = page.locator(selector).first();
      await locator.waitFor({
        state: 'visible',
        timeout: CONFIG.TIMEOUTS.ELEMENT_WAIT,
      });
      return locator;
    } catch {
      // Try next selector
    }
  }

  throw new NavigationError(
    `Could not find ${description}. Tried selectors: ${selectors.join(', ')}`
  );
}

/**
 * Waits for the sidebar to be visible
 */
export async function waitForSidebar(page: Page): Promise<Locator> {
  return findElement(page, SELECTORS.sidebar, 'sidebar');
}

/**
 * Finds and clicks the Projects link in the sidebar
 */
export async function clickProjectsLink(
  page: Page,
  onProgress: ProgressCallback
): Promise<void> {
  onProgress('Looking for Projects link...');

  const projectsLink = await findElement(
    page,
    SELECTORS.projectsLink,
    'Projects link'
  );

  await projectsLink.click();
  onProgress('Clicked Projects link');

  // Wait for menu animation
  await page.waitForTimeout(CONFIG.DELAYS.MENU_ANIMATION);
}

/**
 * Expands the "See more" section if present
 */
export async function expandSeeMore(
  page: Page,
  onProgress: ProgressCallback
): Promise<void> {
  try {
    const seeMoreButton = await findElement(
      page,
      SELECTORS.seeMore,
      'See more button'
    );

    await seeMoreButton.click();
    onProgress('Expanded "See more" to reveal full project list');

    // Wait for expansion animation
    await page.waitForTimeout(CONFIG.DELAYS.MENU_ANIMATION);
  } catch {
    // "See more" may not exist if there are few projects
    onProgress('No "See more" button found - project list may be short');
  }
}

/**
 * Gets the scrollable container for the projects list.
 * Falls back to sidebar if no specific container found.
 */
export async function getProjectsContainer(page: Page): Promise<Locator> {
  // First try specific container selectors
  for (const selector of SELECTORS.projectsContainer) {
    try {
      const locator = page.locator(selector).first();
      await locator.waitFor({
        state: 'visible',
        timeout: 2000,
      });
      return locator;
    } catch {
      // Try next
    }
  }

  // Fall back to finding the parent of project items
  for (const selector of SELECTORS.projectItem) {
    try {
      const items = page.locator(selector);
      const count = await items.count();
      if (count > 0) {
        // Return the sidebar as the scroll container
        const sidebar = await findElement(page, SELECTORS.sidebar, 'sidebar');
        return sidebar;
      }
    } catch {
      // Try next
    }
  }

  // Last resort: use sidebar as container
  return findElement(page, SELECTORS.sidebar, 'sidebar as fallback container');
}

/**
 * Full navigation sequence to open Projects menu
 * Returns the scrollable projects container
 */
export async function navigateToProjectsMenu(
  page: Page,
  onProgress: ProgressCallback
): Promise<Locator> {
  onProgress('Navigating to Projects menu...');

  // Wait for sidebar to be ready
  await waitForSidebar(page);
  onProgress('Sidebar loaded');

  // Click Projects link
  await clickProjectsLink(page, onProgress);

  // Expand "See more" if available
  await expandSeeMore(page, onProgress);

  // Get the scrollable container (or sidebar as fallback)
  const container = await getProjectsContainer(page);
  onProgress('Projects menu ready for enumeration');

  return container;
}

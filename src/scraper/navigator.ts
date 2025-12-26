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
 * Opens the "See more" popup and returns the popup locator.
 * The popup must be kept open by maintaining cursor within it.
 */
export async function openSeeMorePopup(
  page: Page,
  onProgress: ProgressCallback
): Promise<Locator | null> {
  // Find and click the "See more" button in Projects section
  const seeMoreSelectors = [
    'text="See more"',
    'button:has-text("See more")',
    'div:has-text("See more")',
  ];

  for (const selector of seeMoreSelectors) {
    try {
      const button = page.locator(selector).first();
      await button.waitFor({ state: 'visible', timeout: 2000 });
      await button.click();
      onProgress('Clicked "See more" to open projects popup');
      await page.waitForTimeout(CONFIG.DELAYS.MENU_ANIMATION);

      // Find the popup that appeared - it contains project links
      const popupSelectors = [
        '[role="menu"]',
        '[data-radix-popper-content-wrapper]',
        'div[class*="popover"]',
        'div[class*="dropdown"]',
        'div[class*="menu"]',
      ];

      for (const popupSelector of popupSelectors) {
        try {
          const popup = page.locator(popupSelector).first();
          await popup.waitFor({ state: 'visible', timeout: 1000 });

          // Verify it has project links
          const hasProjects = await popup.locator('a[href$="/project"]').count();
          if (hasProjects > 0) {
            onProgress(`Found projects popup with ${hasProjects} visible items`);
            return popup;
          }
        } catch {
          // Try next popup selector
        }
      }

      // Fallback: find popup by looking for element containing project links
      const popupWithProjects = page.locator('div:has(a[href$="/project"])').last();
      const projectCount = await popupWithProjects.locator('a[href$="/project"]').count();
      if (projectCount > 5) {
        onProgress(`Found popup container with ${projectCount} projects`);
        return popupWithProjects;
      }

      break;
    } catch {
      // Try next selector
    }
  }

  onProgress('Could not find "See more" popup');
  return null;
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
 * Full navigation sequence to prepare for project enumeration.
 * Projects are visible in the sidebar - no navigation needed.
 * Returns the sidebar as the scrollable container.
 * @deprecated Use waitForSidebar + openSeeMorePopup instead
 */
export async function navigateToProjectsMenu(
  page: Page,
  onProgress: ProgressCallback
): Promise<Locator> {
  onProgress('Preparing to scan Projects...');

  // Wait for sidebar to be ready
  const sidebar = await waitForSidebar(page);
  onProgress('Sidebar loaded');

  // Check if projects are visible
  const projectSelector = 'a[href$="/project"]';
  const projectCount = await page.locator(projectSelector).count();
  onProgress(`Found ${projectCount} project links in sidebar`);

  // Return sidebar as the container for scrolling
  return sidebar;
}

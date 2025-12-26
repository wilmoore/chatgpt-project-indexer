import { Page, Locator } from 'playwright';
import { SELECTORS, CONFIG } from '../config/constants.js';
import { ProjectRecord, ProjectCallback, ProgressCallback } from '../types/index.js';
import { getProjectItems } from './scroller.js';

export class ExtractionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ExtractionError';
  }
}

/**
 * Extracts project ID from href attribute.
 * Expected formats: /g/{id} or /project/{id}
 */
function extractIdFromHref(href: string | null): string | null {
  if (!href) return null;

  // Match /g/{id} or /project/{id} patterns
  const match = href.match(/\/(?:g|project)\/([a-zA-Z0-9_-]+)/);
  return match?.[1] ?? null;
}

/**
 * Waits for tooltip to appear and extracts its text content.
 */
async function waitForTooltip(page: Page): Promise<string | null> {
  for (const selector of SELECTORS.tooltip) {
    try {
      const tooltip = page.locator(selector).first();
      await tooltip.waitFor({
        state: 'visible',
        timeout: CONFIG.TIMEOUTS.TOOLTIP_APPEAR,
      });

      const text = await tooltip.textContent();
      return text?.trim() ?? null;
    } catch {
      // Try next selector
    }
  }

  return null;
}

/**
 * Extracts data from a single project item via hover.
 */
export async function extractProjectData(
  page: Page,
  itemLocator: Locator
): Promise<ProjectRecord> {
  // Hover to trigger tooltip
  await itemLocator.hover();

  // Wait briefly for tooltip
  await page.waitForTimeout(100);

  // Try to get full title from tooltip
  let fullTitle = await waitForTooltip(page);

  // Fallback to visible text if no tooltip
  if (!fullTitle) {
    fullTitle = await itemLocator.textContent();
  }

  if (!fullTitle) {
    throw new ExtractionError('Could not extract title from project item');
  }

  // Extract ID from href attribute (without clicking)
  const href = await itemLocator.getAttribute('href');
  const id = extractIdFromHref(href);

  if (!id) {
    throw new ExtractionError(`Could not extract project ID from href: ${href}`);
  }

  const now = new Date().toISOString();

  return {
    id,
    title: fullTitle.trim(),
    firstSeenAt: now,
    lastConfirmedAt: now,
  };
}

/**
 * Extracts data from all project items in the container.
 * Calls onProject callback for each successfully extracted project.
 */
export async function extractAllProjects(
  page: Page,
  container: Locator,
  onProject: ProjectCallback,
  onProgress: ProgressCallback
): Promise<{ extracted: number; failed: number }> {
  const items = await getProjectItems(container);
  const count = await items.count();

  onProgress(`Extracting data from ${count} projects...`);

  let extracted = 0;
  let failed = 0;

  for (let i = 0; i < count; i++) {
    const item = items.nth(i);

    try {
      const project = await extractProjectData(page, item);
      onProject(project);
      extracted++;

      if (extracted % 10 === 0) {
        onProgress(`Extracted ${extracted}/${count} projects`);
      }
    } catch (error) {
      failed++;
      const errorMessage = error instanceof Error ? error.message : String(error);
      onProgress(`Warning: Failed to extract project ${i + 1}: ${errorMessage}`);
    }

    // Brief pause between hovers to avoid rate limiting
    await page.waitForTimeout(CONFIG.DELAYS.BETWEEN_HOVERS);
  }

  onProgress(`Extraction complete: ${extracted} extracted, ${failed} failed`);

  return { extracted, failed };
}

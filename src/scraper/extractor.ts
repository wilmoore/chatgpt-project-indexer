import { Page, Locator } from 'playwright';
import { SELECTORS, CONFIG } from '../config/constants.js';
import { ProjectRecord, ProjectCallback, ProgressCallback } from '../types/index.js';
import { getProjectItems } from './scroller.js';

/**
 * Extracts all projects from a popup menu.
 * The popup has already been scrolled to load all items.
 * Extraction is done without hovering to avoid closing the popup.
 */
export async function extractProjectsFromPopup(
  page: Page,
  popup: Locator,
  onProject: ProjectCallback,
  onProgress: ProgressCallback
): Promise<{ extracted: number; failed: number }> {
  // Get all project links within the popup
  const items = popup.locator('a[href$="/project"]');
  const count = await items.count();

  onProgress(`Extracting data from ${count} projects in popup...`);

  let extracted = 0;
  let failed = 0;

  for (let i = 0; i < count; i++) {
    const item = items.nth(i);

    try {
      // Extract href for ID
      const href = await item.getAttribute('href');
      const id = extractIdFromHref(href);

      if (!id) {
        failed++;
        continue;
      }

      // Get title from innerText directly (contains proper-cased title)
      // Note: Don't use querySelector for child elements - the first div is the icon container
      const innerText = await item.evaluate((el) => {
        return (el as HTMLElement).innerText?.trim() || '';
      });

      // Fallback to title attribute if innerText is empty
      const titleAttr = await item.getAttribute('title');

      // Priority: innerText > title attribute > slug fallback
      let title = '';
      if (innerText && innerText.length < 200) {
        title = innerText;
      } else if (titleAttr && titleAttr.length < 200) {
        title = titleAttr;
      } else {
        // Last resort - extract from URL slug (loses casing)
        const slugMatch = id.match(/g-p-[a-z0-9]+-(.+)$/);
        title = slugMatch ? slugMatch[1].replace(/-/g, ' ') : id;
      }

      const now = new Date().toISOString();
      const project: ProjectRecord = {
        id,
        title: title.trim(),
        firstSeenAt: now,
        lastConfirmedAt: now,
      };

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
  }

  onProgress(`Extraction complete: ${extracted} extracted, ${failed} failed`);
  return { extracted, failed };
}

export class ExtractionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ExtractionError';
  }
}

/**
 * Extracts project ID from href attribute.
 * Project URLs: /g/g-p-{id}/project
 */
function extractIdFromHref(href: string | null): string | null {
  if (!href) return null;

  // Match /g/g-p-{id}/project pattern (ChatGPT Projects)
  const projectMatch = href.match(/\/g\/(g-p-[a-zA-Z0-9_-]+)\/project/);
  if (projectMatch) {
    return projectMatch[1];
  }

  // Fallback: match /g/{id} pattern
  const gptMatch = href.match(/\/g\/([a-zA-Z0-9_-]+)/);
  return gptMatch?.[1] ?? null;
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
  // Extract ID from href attribute first (without clicking)
  const href = await itemLocator.getAttribute('href');
  const id = extractIdFromHref(href);

  if (!id) {
    throw new ExtractionError(`Could not extract project ID from href: ${href}`);
  }

  // Try multiple approaches to get the title
  // 1. First check for title attribute on the anchor (common for accessibility)
  let titleAttr = await itemLocator.getAttribute('title');

  // 2. Try innerText (respects CSS visibility, unlike textContent)
  let innerTextTitle: string | null = null;
  try {
    innerTextTitle = await itemLocator.evaluate((el) => {
      const htmlEl = el as HTMLElement;
      // Look for a text node or span that contains just the project name
      const textSpan = htmlEl.querySelector('span, div');
      if (textSpan) {
        return (textSpan as HTMLElement).innerText?.trim() || '';
      }
      return htmlEl.innerText?.trim() || '';
    });
  } catch {
    // Fallback to textContent if evaluate fails
    innerTextTitle = await itemLocator.textContent();
  }

  // 3. Hover to trigger tooltip for full title
  await itemLocator.hover();
  await page.waitForTimeout(300);

  // 4. Try to get full title from tooltip
  let fullTitle = await waitForTooltip(page);

  // Pick the best title: tooltip > title attribute > innerText
  // Prefer shorter values if they're reasonable (not truncated snippets)
  let title = '';
  if (fullTitle && fullTitle.length < 200) {
    title = fullTitle;
  } else if (titleAttr && titleAttr.length < 200) {
    title = titleAttr;
  } else if (innerTextTitle && innerTextTitle.length < 200) {
    title = innerTextTitle;
  } else {
    // Last resort - use the ID's slug part as title
    const slugMatch = id.match(/g-p-[a-z0-9]+-(.+)$/);
    title = slugMatch ? slugMatch[1].replace(/-/g, ' ') : innerTextTitle || '';
  }

  // Move mouse away to dismiss tooltip
  await page.mouse.move(0, 0);

  if (!title) {
    throw new ExtractionError('Could not extract title from project item');
  }

  const now = new Date().toISOString();

  return {
    id,
    title: title.trim(),
    firstSeenAt: now,
    lastConfirmedAt: now,
  };
}

/**
 * Extracts data from all project items on the page.
 * Calls onProject callback for each successfully extracted project.
 */
export async function extractAllProjects(
  page: Page,
  container: Locator,
  onProject: ProjectCallback,
  onProgress: ProgressCallback
): Promise<{ extracted: number; failed: number }> {
  const items = await getProjectItems(page);
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

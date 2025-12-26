import { BrowserContext, Page, Locator } from 'playwright';
import { launchBrowser, navigateToChatGPT, closeBrowser } from '../browser/manager.js';
import { ensureAuthenticated } from '../auth/recovery.js';
import { waitForSidebar, openSeeMorePopup } from './navigator.js';
import { scrollPopupUntilExhausted, scrollUntilExhausted } from './scroller.js';
import { extractAllProjects, extractProjectsFromPopup } from './extractor.js';
import { ProjectWriter } from '../storage/writer.js';
import { ProgressCallback, RunOptions } from '../types/index.js';

export interface EnumerationResult {
  totalProjects: number;
  extracted: number;
  failed: number;
  outputPath: string;
}

/**
 * Runs the complete project enumeration workflow.
 */
export async function runEnumeration(
  options: RunOptions,
  onProgress: ProgressCallback
): Promise<EnumerationResult> {
  let context: BrowserContext | null = null;
  const writer = new ProjectWriter(options.output);

  try {
    // Initialize storage
    await writer.initialize();
    const existingCount = writer.getCount();
    if (existingCount > 0) {
      onProgress(`Loaded ${existingCount} existing projects from storage`);
    }

    // Launch browser
    const { context: browserContext, page } = await launchBrowser({
      forceHeadful: options.headful,
      onProgress,
    });
    context = browserContext;

    // Navigate to ChatGPT
    onProgress('Navigating to ChatGPT...');
    await navigateToChatGPT(page);

    // Wait for page to stabilize
    await page.waitForTimeout(2000);

    // Ensure authenticated (will wait for login if needed)
    await ensureAuthenticated(page, onProgress);

    // Wait for sidebar
    onProgress('Waiting for sidebar...');
    const sidebar = await waitForSidebar(page);
    onProgress('Sidebar loaded');

    // Open the "See more" popup for Projects
    const popup = await openSeeMorePopup(page, onProgress);

    let totalProjects = 0;
    let extracted = 0;
    let failed = 0;

    if (popup) {
      // Use popup-based extraction with infinite scroll
      totalProjects = await scrollPopupUntilExhausted(page, popup, onProgress);

      // Extract from popup (cursor must stay inside)
      const result = await extractProjectsFromPopup(
        page,
        popup,
        (project) => writer.addProject(project),
        onProgress
      );
      extracted = result.extracted;
      failed = result.failed;
    } else {
      // Fallback: extract from sidebar directly
      onProgress('Falling back to sidebar extraction...');
      totalProjects = await scrollUntilExhausted(page, sidebar, onProgress);

      const result = await extractAllProjects(
        page,
        sidebar,
        (project) => writer.addProject(project),
        onProgress
      );
      extracted = result.extracted;
      failed = result.failed;
    }

    // Final flush
    await writer.close();

    const result: EnumerationResult = {
      totalProjects,
      extracted,
      failed,
      outputPath: options.output ?? 'projects.json',
    };

    onProgress(`\nEnumeration complete!`);
    onProgress(`Total projects found: ${totalProjects}`);
    onProgress(`Successfully extracted: ${extracted}`);
    onProgress(`Failed: ${failed}`);
    onProgress(`Output saved to: ${result.outputPath}`);

    return result;
  } finally {
    // Cleanup
    if (context) {
      await closeBrowser(context);
    }
  }
}

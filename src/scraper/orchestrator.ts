import type { BrowserContext } from 'playwright';
import { launchBrowser, navigateToChatGPT, closeBrowser } from '../browser/manager.js';
import { ensureAuthenticated } from '../auth/recovery.js';
import { waitForSidebar, openSeeMorePopup } from './navigator.js';
import { scrollPopupUntilExhausted, scrollUntilExhausted } from './scroller.js';
import { extractAllProjects, extractProjectsFromPopup } from './extractor.js';
import {
  createStorageBackends,
  initializeBackends,
  startRun,
  completeRun,
  failRun,
  closeBackends,
} from '../storage/index.js';
import type { ProgressCallback, RunOptions, ProjectRecord } from '../types/index.js';

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
  const backends = createStorageBackends(options.output);

  // Helper to add project to all backends
  const addProjectToAll = (project: ProjectRecord): void => {
    for (const backend of backends) {
      backend.addProject(project);
    }
  };

  try {
    // Initialize all storage backends
    await initializeBackends(backends);
    const existingCount = backends[0]?.getCount() ?? 0;
    if (existingCount > 0) {
      onProgress(`Loaded ${existingCount} existing projects from storage`);
    }

    // Start a new enumeration run (for backends that support it)
    await startRun(backends);

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
        addProjectToAll,
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
        addProjectToAll,
        onProgress
      );
      extracted = result.extracted;
      failed = result.failed;
    }

    // Complete the run (triggers cleanup of old runs)
    await completeRun(backends, { found: totalProjects, extracted });

    // Final flush to all backends
    await closeBackends(backends);

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
  } catch (error) {
    // Mark run as failed if an error occurs
    await failRun(backends);
    throw error;
  } finally {
    // Cleanup
    if (context) {
      await closeBrowser(context);
    }
  }
}

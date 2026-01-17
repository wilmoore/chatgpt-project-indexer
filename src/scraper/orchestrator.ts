import type { BrowserContext, Page } from 'playwright';
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
import type { ProgressCallback, RunOptions, ProjectRecord, ScanResult } from '../types/index.js';
import type { StorageBackend } from '../storage/types.js';
import { logger, parseInterval, formatInterval } from '../utils/logger.js';
import { CONFIG } from '../config/constants.js';
import { createTouchMechanism, createTouchQueueProcessor, TouchQueueProcessor } from '../touch/index.js';

export interface EnumerationResult {
  totalProjects: number;
  extracted: number;
  failed: number;
  outputPath: string;
}

/** Signal for graceful shutdown */
let shutdownRequested = false;

/**
 * Request graceful shutdown of watch mode.
 */
export function requestShutdown(): void {
  shutdownRequested = true;
}

/**
 * Check if shutdown was requested.
 */
export function isShutdownRequested(): boolean {
  return shutdownRequested;
}

/**
 * Reset shutdown flag (for testing).
 */
export function resetShutdown(): void {
  shutdownRequested = false;
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

/**
 * Performs a single scan cycle (for use in watch mode).
 * Keeps browser open for reuse.
 */
async function runSingleScan(
  page: Page,
  backends: StorageBackend[],
  previousProjectIds: Set<string>
): Promise<ScanResult> {
  const currentProjectIds = new Set<string>();

  // Helper to add project to all backends and track IDs
  const addProjectToAll = (project: ProjectRecord): void => {
    currentProjectIds.add(project.id);
    for (const backend of backends) {
      backend.addProject(project);
    }
  };

  // Navigate to ChatGPT (refresh the page)
  await navigateToChatGPT(page);
  await page.waitForTimeout(2000);

  // Ensure authenticated
  await ensureAuthenticated(page, () => {});

  // Wait for sidebar
  const sidebar = await waitForSidebar(page);

  // Open the "See more" popup for Projects
  const popup = await openSeeMorePopup(page, () => {});

  let totalProjects = 0;
  let extracted = 0;
  let failed = 0;

  if (popup) {
    totalProjects = await scrollPopupUntilExhausted(page, popup, () => {});
    const result = await extractProjectsFromPopup(page, popup, addProjectToAll, () => {});
    extracted = result.extracted;
    failed = result.failed;
  } else {
    totalProjects = await scrollUntilExhausted(page, sidebar, () => {});
    const result = await extractAllProjects(page, sidebar, addProjectToAll, () => {});
    extracted = result.extracted;
    failed = result.failed;
  }

  // Calculate delta
  const newProjects = [...currentProjectIds].filter((id) => !previousProjectIds.has(id)).length;
  const unchangedProjects = extracted - newProjects;

  return {
    totalProjects,
    extracted,
    failed,
    newProjects,
    unchangedProjects,
    projectIds: currentProjectIds,
  };
}

/**
 * Runs continuous enumeration in watch mode.
 * Scans at regular intervals and reports deltas.
 * Also processes touch queue requests from the API.
 */
export async function runWatchMode(
  options: RunOptions,
  onProgress: ProgressCallback
): Promise<void> {
  const intervalStr = options.interval ?? CONFIG.WATCH.DEFAULT_INTERVAL;
  const intervalMs = parseInterval(intervalStr);

  if (intervalMs < CONFIG.WATCH.MIN_INTERVAL_MS) {
    throw new Error(`Interval must be at least ${formatInterval(CONFIG.WATCH.MIN_INTERVAL_MS)}`);
  }

  logger.info(`Starting watch mode (interval: ${formatInterval(intervalMs)})`);

  let context: BrowserContext | null = null;
  let page: Page | null = null;
  const backends = createStorageBackends(options.output);
  let previousProjectIds = new Set<string>();
  let scanCount = 0;

  // Touch queue processor for API-triggered touch operations
  let queueProcessor: TouchQueueProcessor | null = null;
  const touchMechanism = createTouchMechanism('icon_color');

  // Setup signal handlers
  const handleSignal = (signal: string) => {
    logger.info(`Received ${signal}, shutting down gracefully...`);
    if (queueProcessor) {
      queueProcessor.stopPolling();
    }
    requestShutdown();
  };

  process.on('SIGTERM', () => handleSignal('SIGTERM'));
  process.on('SIGINT', () => handleSignal('SIGINT'));

  // Helper to launch/relaunch browser
  const ensureBrowser = async (): Promise<Page> => {
    // Check if current page is still usable
    if (page) {
      try {
        await page.evaluate(() => true);
        return page;
      } catch {
        // Page is dead, need to relaunch
        logger.info('Browser session expired, relaunching...');
      }
    }

    // Close old context if exists
    if (context) {
      try {
        await closeBrowser(context);
      } catch {
        // Ignore cleanup errors
      }
    }

    // Launch new browser
    const result = await launchBrowser({
      forceHeadful: options.headful,
      onProgress: (msg) => logger.info(msg),
    });
    context = result.context;
    page = result.page;
    return page;
  };

  try {
    // Initialize storage
    await initializeBackends(backends);
    const existingCount = backends[0]?.getCount() ?? 0;
    if (existingCount > 0) {
      logger.info(`Loaded ${existingCount} existing projects from storage`);
    }

    // Main watch loop
    while (!isShutdownRequested()) {
      scanCount++;

      try {
        // Ensure browser is available
        const activePage = await ensureBrowser();

        // Pause touch queue during scan to avoid race condition with navigation
        // (touch operations use page.evaluate which gets destroyed on navigation)
        if (queueProcessor?.isPolling()) {
          queueProcessor.stopPolling();
        }

        // Start a new run for this scan
        await startRun(backends);

        const result = await runSingleScan(activePage, backends, previousProjectIds);

        // Start/resume touch queue processor AFTER scan completes
        // This ensures the page is stable and won't navigate during touch operations
        if (!queueProcessor) {
          queueProcessor = createTouchQueueProcessor();
        }
        if (!queueProcessor.isPolling()) {
          queueProcessor.startPolling(activePage, touchMechanism, (result) => {
            if (result.processed > 0) {
              logger.info(
                `Touch queue: processed ${result.processed} request(s) ` +
                `(${result.succeeded} succeeded, ${result.failed} failed)`
              );
            }
          });
        }

        // Complete the run
        await completeRun(backends, { found: result.totalProjects, extracted: result.extracted });

        // Log result with delta
        if (result.failed > 0) {
          logger.warn(
            `Scan #${scanCount} complete: ${result.extracted} projects ` +
              `(${result.newProjects} new, ${result.unchangedProjects} unchanged, ${result.failed} failed)`
          );
        } else {
          logger.info(
            `Scan #${scanCount} complete: ${result.extracted} projects ` +
              `(${result.newProjects} new, ${result.unchangedProjects} unchanged)`
          );
        }

        // Update tracking for next scan
        previousProjectIds = result.projectIds;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.warn(`Scan #${scanCount} failed: ${message} - will retry in ${formatInterval(intervalMs)}`);
        await failRun(backends);

        // Mark page as dead if it's a browser error
        if (message.includes('Target page') || message.includes('browser has been closed')) {
          page = null;
          // Stop queue processor since page is dead - will restart with new page
          if (queueProcessor) {
            queueProcessor.stopPolling();
          }
        }
      }

      // Sleep until next scan (or shutdown)
      if (!isShutdownRequested()) {
        logger.info(`Next scan in ${formatInterval(intervalMs)}`);
        await sleep(intervalMs, () => isShutdownRequested());
      }
    }

    logger.info('Watch mode stopped');
  } finally {
    // Stop touch queue polling
    if (queueProcessor) {
      queueProcessor.stopPolling();
    }
    await closeBackends(backends);
    if (context) {
      await closeBrowser(context);
    }
  }
}

/**
 * Sleeps for the specified duration, but can be interrupted.
 */
async function sleep(ms: number, shouldStop: () => boolean): Promise<void> {
  const checkInterval = 1000; // Check every second
  let elapsed = 0;

  while (elapsed < ms && !shouldStop()) {
    await new Promise((resolve) => setTimeout(resolve, Math.min(checkInterval, ms - elapsed)));
    elapsed += checkInterval;
  }
}

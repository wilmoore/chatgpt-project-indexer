import { BrowserContext, Page } from 'playwright';
import { launchBrowser, navigateToChatGPT, closeBrowser } from '../browser/manager.js';
import { ensureAuthenticated } from '../auth/recovery.js';
import { navigateToProjectsMenu } from './navigator.js';
import { scrollUntilExhausted } from './scroller.js';
import { extractAllProjects } from './extractor.js';
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

    // Ensure authenticated
    await ensureAuthenticated(page, onProgress);

    // Navigate to Projects menu
    const container = await navigateToProjectsMenu(page, onProgress);

    // Scroll to load all projects
    const totalProjects = await scrollUntilExhausted(page, container, onProgress);

    // Extract project data
    const { extracted, failed } = await extractAllProjects(
      page,
      container,
      (project) => writer.addProject(project),
      onProgress
    );

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

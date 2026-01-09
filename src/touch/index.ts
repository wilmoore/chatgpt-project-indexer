import type { Page } from 'playwright';
import type { ProjectRecord } from '../types/index.js';
import type {
  TouchMechanism,
  TouchResult,
  TouchAllResult,
  TouchConfig,
} from './types.js';
import { DEFAULT_TOUCH_CONFIG } from './types.js';
import { IconColorTouch } from './icon-color.js';

export * from './types.js';
export { IconColorTouch } from './icon-color.js';

/**
 * Available touch mechanisms
 */
export type TouchMechanismType = 'icon_color';

/**
 * Creates a touch mechanism by type
 */
export function createTouchMechanism(
  type: TouchMechanismType = 'icon_color',
  config?: Partial<TouchConfig>
): TouchMechanism {
  switch (type) {
    case 'icon_color':
      return new IconColorTouch(config);
    default:
      throw new Error(`Unknown touch mechanism: ${type}`);
  }
}

/**
 * Touches all provided projects in order
 *
 * Projects are touched in reverse pinnedAt order (oldest first)
 * so that the most recently pinned project ends up at the top.
 *
 * @param page Playwright page with active ChatGPT session
 * @param projects Projects to touch (should already be sorted by pinnedAt ascending)
 * @param mechanism Touch mechanism to use
 * @param config Configuration options
 * @param onProgress Optional callback for progress updates
 */
export async function touchAllProjects(
  page: Page,
  projects: ProjectRecord[],
  mechanism: TouchMechanism,
  config: Partial<TouchConfig> = {},
  onProgress?: (message: string) => void
): Promise<TouchAllResult> {
  const fullConfig = { ...DEFAULT_TOUCH_CONFIG, ...config };
  const results: TouchResult[] = [];

  // Touch in order (oldest pinned first, so newest ends up at very top)
  for (let i = 0; i < projects.length; i++) {
    const project = projects[i];

    if (onProgress) {
      onProgress(`Touching ${i + 1}/${projects.length}: ${project.title}`);
    }

    const result = await mechanism.touch(page, project);
    results.push(result);

    if (!result.success) {
      console.error(`Failed to touch ${project.title}: ${result.error}`);
    }

    // Delay between touches (except after last one)
    if (i < projects.length - 1) {
      await new Promise((resolve) =>
        setTimeout(resolve, fullConfig.delayBetweenTouches)
      );
    }
  }

  const success = results.filter((r) => r.success).length;
  const failed = results.filter((r) => !r.success).length;

  return {
    total: projects.length,
    success,
    failed,
    results,
  };
}

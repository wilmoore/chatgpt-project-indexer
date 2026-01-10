import type { Page } from 'playwright';
import type { ProjectRecord } from '../types/index.js';
import type {
  TouchMechanism,
  TouchResult,
  TouchConfig,
  GizmoDisplay,
} from './types.js';
import { DEFAULT_TOUCH_CONFIG } from './types.js';

/**
 * ChatGPT API endpoint for gizmo upsert
 */
const GIZMO_UPSERT_URL = 'https://chatgpt.com/backend-api/gizmos/snorlax/upsert';

/**
 * Fetches the current gizmo data from ChatGPT API
 */
async function fetchGizmo(
  page: Page,
  gizmoId: string
): Promise<{ display: GizmoDisplay; instructions: string } | null> {
  const result = await page.evaluate(async (id: string) => {
    try {
      const response = await fetch(`https://chatgpt.com/backend-api/gizmos/${id}`, {
        method: 'GET',
        credentials: 'include',
      });

      if (!response.ok) {
        return { error: `Failed to fetch gizmo: ${response.status}` };
      }

      const data = await response.json();
      return {
        display: data.gizmo?.display,
        instructions: data.gizmo?.instructions || '',
      };
    } catch (error) {
      return { error: String(error) };
    }
  }, gizmoId);

  if ('error' in result) {
    console.error(`Failed to fetch gizmo ${gizmoId}:`, result.error);
    return null;
  }

  return result as { display: GizmoDisplay; instructions: string };
}

/**
 * Updates gizmo display settings via ChatGPT API
 */
async function updateGizmo(
  page: Page,
  gizmoId: string,
  display: GizmoDisplay,
  instructions: string
): Promise<{ success: boolean; error?: string }> {
  const result = await page.evaluate(
    async (args: { id: string; display: GizmoDisplay; instructions: string }) => {
      try {
        const response = await fetch('https://chatgpt.com/backend-api/gizmos/snorlax/upsert', {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            gizmo_id: args.id,
            display: args.display,
            instructions: args.instructions,
          }),
        });

        if (!response.ok) {
          const text = await response.text();
          return { success: false, error: `API error ${response.status}: ${text}` };
        }

        return { success: true };
      } catch (error) {
        return { success: false, error: String(error) };
      }
    },
    { id: gizmoId, display, instructions }
  );

  return result;
}

/**
 * Touch mechanism that flips icon color and restores it
 *
 * Flow:
 * 1. Fetch current gizmo state
 * 2. Update with temporary color (triggers "touched" timestamp)
 * 3. Immediately restore original color
 * 4. Net effect: project floats to top, no visible change
 */
export class IconColorTouch implements TouchMechanism {
  readonly name = 'IconColorFlip';
  private config: TouchConfig;

  constructor(config: Partial<TouchConfig> = {}) {
    this.config = { ...DEFAULT_TOUCH_CONFIG, ...config };
  }

  async touch(page: Page, project: ProjectRecord): Promise<TouchResult> {
    const gizmoId = project.id;

    // Step 1: Fetch current state
    const current = await fetchGizmo(page, gizmoId);
    if (!current) {
      return {
        projectId: gizmoId,
        success: false,
        error: 'Failed to fetch current gizmo state',
      };
    }

    const originalColor = current.display.theme;
    const tempColor = this.config.tempColor;

    // If temp color is same as original, pick a different one
    const flipColor = originalColor === tempColor ? '#ffffff' : tempColor;

    // Step 2: Flip to temporary color
    const flipResult = await updateGizmo(page, gizmoId, {
      ...current.display,
      theme: flipColor,
    }, current.instructions);

    if (!flipResult.success) {
      return {
        projectId: gizmoId,
        success: false,
        error: `Failed to flip color: ${flipResult.error}`,
      };
    }

    // Small delay to ensure the change is registered
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Step 3: Restore original color
    const restoreResult = await updateGizmo(page, gizmoId, {
      ...current.display,
      theme: originalColor,
    }, current.instructions);

    if (!restoreResult.success) {
      // This is bad - we've changed the color but couldn't restore it
      console.error(`WARNING: Failed to restore color for ${project.title}. Manual fix needed.`);
      return {
        projectId: gizmoId,
        success: false,
        error: `Failed to restore color: ${restoreResult.error}`,
      };
    }

    return {
      projectId: gizmoId,
      success: true,
    };
  }
}

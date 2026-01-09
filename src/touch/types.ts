import type { Page } from 'playwright';
import type { ProjectRecord } from '../types/index.js';

/**
 * Result of touching a single project
 */
export interface TouchResult {
  projectId: string;
  success: boolean;
  error?: string;
}

/**
 * Result of touching all pinned projects
 */
export interface TouchAllResult {
  total: number;
  success: number;
  failed: number;
  results: TouchResult[];
}

/**
 * Gizmo display settings from ChatGPT API
 */
export interface GizmoDisplay {
  name: string;
  description: string;
  emoji: string;
  theme: string; // hex color like "#ff66ad"
  prompt_starters: string[];
}

/**
 * Minimal gizmo payload for touch (what we send to the API)
 */
export interface GizmoTouchPayload {
  gizmo_id: string;
  display: GizmoDisplay;
}

/**
 * Interface for touch mechanisms
 */
export interface TouchMechanism {
  /** Human-readable name */
  readonly name: string;

  /**
   * Touch a single project to float it to the top
   * @param page Playwright page with active ChatGPT session
   * @param project Project record to touch
   * @returns Touch result
   */
  touch(page: Page, project: ProjectRecord): Promise<TouchResult>;
}

/**
 * Configuration for touch operations
 */
export interface TouchConfig {
  /** Delay between touching each project (ms) */
  delayBetweenTouches: number;
  /** Temporary color to use during flip (restored immediately) */
  tempColor: string;
}

export const DEFAULT_TOUCH_CONFIG: TouchConfig = {
  delayBetweenTouches: 500,
  tempColor: '#000000', // Black - visually distinct if restoration fails
};

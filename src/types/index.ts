/**
 * Authentication state of the browser session
 */
export enum AuthState {
  AUTHENTICATED = 'authenticated',
  LOGIN_REQUIRED = 'login_required',
  SESSION_EXPIRED = 'session_expired',
  UNKNOWN = 'unknown',
}

/**
 * A discovered ChatGPT Project record
 */
export interface ProjectRecord {
  /** Unique project identifier from ChatGPT */
  id: string;
  /** Full project title (from tooltip, not truncated) */
  title: string;
  /** ISO 8601 timestamp of first discovery */
  firstSeenAt: string;
  /** ISO 8601 timestamp of most recent confirmation */
  lastConfirmedAt: string;
}

/**
 * Storage file format for persisted projects
 */
export interface StorageFile {
  version: 1;
  lastUpdatedAt: string;
  projects: ProjectRecord[];
}

/**
 * Progress information during scroll enumeration
 */
export interface ScrollProgress {
  totalItems: number;
  newItemsThisPass: number;
  isExhausted: boolean;
}

/**
 * CLI options for the run command
 */
export interface RunOptions {
  headful?: boolean;
  output?: string;
  watch?: boolean;
  interval?: string;
}

/**
 * Result of a single enumeration scan (with delta information)
 */
export interface ScanResult {
  totalProjects: number;
  extracted: number;
  failed: number;
  newProjects: number;
  unchangedProjects: number;
  projectIds: Set<string>;
}

/**
 * Callback for enumeration progress updates
 */
export type ProgressCallback = (message: string) => void;

/**
 * Callback for project discovery
 */
export type ProjectCallback = (project: ProjectRecord) => void;

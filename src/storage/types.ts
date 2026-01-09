import type { ProjectRecord } from '../types/index.js';

/**
 * Run tracking info returned when starting a new run
 */
export interface RunInfo {
  id: string;
  startedAt: string;
}

/**
 * Common interface for storage backends.
 * Allows multiple backends (local file, Supabase, etc.) to be used interchangeably.
 */
export interface StorageBackend {
  /** Human-readable name for logging */
  readonly name: string;

  /** Initialize the storage backend (load existing data, authenticate, etc.) */
  initialize(): Promise<void>;

  /** Start a new enumeration run (optional, returns run info if supported) */
  startRun?(): Promise<RunInfo>;

  /** Complete the current run (optional, triggers cleanup if supported) */
  completeRun?(stats: { found: number; extracted: number }): Promise<void>;

  /** Mark the current run as failed (optional) */
  failRun?(): Promise<void>;

  /** Add or update a project record */
  addProject(project: ProjectRecord): void;

  /** Flush any buffered data to storage */
  flush(): Promise<void>;

  /** Close the storage backend, flushing pending data */
  close(): Promise<void>;

  /** Get current project count */
  getCount(): number;

  /** Get all buffered projects */
  getProjects(): ProjectRecord[];

  /** Get a single project by ID (may be async for remote backends) */
  getProject?(id: string): ProjectRecord | undefined | Promise<ProjectRecord | undefined>;

  /** Get only pinned projects, sorted by pinnedAt (oldest first for touch order) */
  getPinnedProjects?(): ProjectRecord[] | Promise<ProjectRecord[]>;
}

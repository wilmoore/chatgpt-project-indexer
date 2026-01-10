import fs from 'fs/promises';
import path from 'path';
import { ProjectRecord, StorageFile } from '../types/index.js';
import { CONFIG } from '../config/constants.js';
import { createEmptyStorage, isValidStorageFile } from './schema.js';

/**
 * Manages incremental writing of project data to JSON storage.
 * Buffers writes and flushes periodically for efficiency.
 */
export class ProjectWriter {
  readonly name = 'Local JSON';

  private buffer: Map<string, ProjectRecord> = new Map();
  private flushTimer: NodeJS.Timeout | null = null;
  private outputPath: string;
  private initialized = false;

  constructor(outputPath?: string) {
    this.outputPath = outputPath ?? CONFIG.DEFAULT_OUTPUT_FILE;
  }

  /**
   * Loads existing data from storage file into buffer
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      const absolutePath = path.resolve(this.outputPath);
      const data = await fs.readFile(absolutePath, 'utf-8');
      const storage = JSON.parse(data);

      if (isValidStorageFile(storage)) {
        for (const project of storage.projects) {
          this.buffer.set(project.id, project);
        }
      }
    } catch (error) {
      // File doesn't exist or is invalid - start fresh
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        console.warn('Warning: Could not load existing storage, starting fresh');
      }
    }

    this.initialized = true;
  }

  /**
   * Adds or updates a project record.
   * Deduplicates by ID, preserving firstSeenAt and pin state for existing records.
   */
  addProject(project: ProjectRecord): void {
    const existing = this.buffer.get(project.id);

    if (existing) {
      // Update: keep original firstSeenAt and pin state, update rest
      this.buffer.set(project.id, {
        ...project,
        firstSeenAt: existing.firstSeenAt,
        lastConfirmedAt: project.lastConfirmedAt,
        // Preserve pin state unless explicitly provided in update
        pinned: project.pinned ?? existing.pinned,
        pinnedAt: project.pinnedAt ?? existing.pinnedAt,
        // Update icon info if provided, otherwise preserve
        iconColor: project.iconColor ?? existing.iconColor,
        iconEmoji: project.iconEmoji ?? existing.iconEmoji,
      });
    } else {
      // New project
      this.buffer.set(project.id, project);
    }

    this.scheduleFlush();
  }

  /**
   * Schedules a flush to disk
   */
  private scheduleFlush(): void {
    if (this.flushTimer) return;

    this.flushTimer = setTimeout(() => {
      this.flush().catch(console.error);
    }, CONFIG.STORAGE.FLUSH_INTERVAL);
  }

  /**
   * Writes buffered data to disk
   */
  async flush(): Promise<void> {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }

    const storage: StorageFile = {
      version: 1,
      lastUpdatedAt: new Date().toISOString(),
      projects: Array.from(this.buffer.values()),
    };

    const absolutePath = path.resolve(this.outputPath);

    // Ensure directory exists
    await fs.mkdir(path.dirname(absolutePath), { recursive: true });

    // Write atomically via temp file
    const tempPath = `${absolutePath}.tmp`;
    await fs.writeFile(tempPath, JSON.stringify(storage, null, 2), 'utf-8');
    await fs.rename(tempPath, absolutePath);
  }

  /**
   * Gets current project count
   */
  getCount(): number {
    return this.buffer.size;
  }

  /**
   * Gets all buffered projects
   */
  getProjects(): ProjectRecord[] {
    return Array.from(this.buffer.values());
  }

  /**
   * Gets a single project by ID
   */
  getProject(id: string): ProjectRecord | undefined {
    return this.buffer.get(id);
  }

  /**
   * Gets only pinned projects, sorted by pinnedAt (oldest first for touch order)
   */
  getPinnedProjects(): ProjectRecord[] {
    return Array.from(this.buffer.values())
      .filter((p) => p.pinned === true)
      .sort((a, b) => {
        const aTime = a.pinnedAt ? new Date(a.pinnedAt).getTime() : 0;
        const bTime = b.pinnedAt ? new Date(b.pinnedAt).getTime() : 0;
        return aTime - bTime;
      });
  }

  /**
   * Closes writer, flushing any pending data
   */
  async close(): Promise<void> {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }

    await this.flush();
  }
}

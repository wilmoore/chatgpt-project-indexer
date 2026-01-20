import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { ProjectRecord } from '../types/index.js';
import type { StorageBackend, RunInfo } from './types.js';
import { CONFIG } from '../config/constants.js';

/**
 * Database row type for projects table
 */
interface ProjectRow {
  id: string;
  title: string;
  url: string;
  first_seen_at: string;
  last_confirmed_at: string;
  run_id: string | null;
  last_confirmed_run_id: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Database row type for runs table
 */
interface RunRow {
  id: string;
  started_at: string;
  completed_at: string | null;
  status: 'running' | 'completed' | 'failed';
  projects_found: number;
  projects_extracted: number;
  created_at: string;
}

/**
 * Manages cloud storage of project data via Supabase.
 *
 * ATOMICITY GUARANTEE:
 * - Projects are NEVER deleted until a new successful run completes
 * - Failed runs do not affect existing data
 * - Cleanup only removes data from runs older than N successful runs
 * - Each project tracks both first_seen (run_id) and last_seen (last_confirmed_run_id)
 */
export class SupabaseWriter implements StorageBackend {
  readonly name = 'Supabase';

  private client: SupabaseClient;
  private buffer: Map<string, ProjectRecord> = new Map();
  private existingIds: Set<string> = new Set();
  private flushTimer: NodeJS.Timeout | null = null;
  private initialized = false;
  private currentRunId: string | null = null;
  private flushSucceeded = false;
  private flushAttempted = false;

  constructor() {
    this.client = createClient(
      CONFIG.SUPABASE.URL,
      CONFIG.SUPABASE.ANON_KEY
    );
  }

  /**
   * Fetches existing project IDs to track count accurately
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      const { data, error } = await this.client
        .from(CONFIG.SUPABASE.TABLE_NAME)
        .select('id');

      if (error) {
        throw error;
      }

      if (data) {
        for (const row of data) {
          this.existingIds.add(row.id);
        }
      }

      console.log(`Supabase: Loaded ${this.existingIds.size} existing projects`);

      // Recovery sync: check local JSON for missing projects
      await this.syncFromLocalStorage(CONFIG.DEFAULT_OUTPUT_FILE);
    } catch (error) {
      console.error('Supabase: Failed to initialize:', error);
      throw error;
    }

    this.initialized = true;
  }

  /**
   * Syncs missing projects from local JSON storage to Supabase.
   * Recovers data lost from failed runs that didn't flush.
   */
  private async syncFromLocalStorage(localJsonPath: string): Promise<number> {
    try {
      const fs = await import('fs/promises');
      const pathModule = await import('path');

      const absolutePath = pathModule.default.resolve(localJsonPath);
      const data = await fs.default.readFile(absolutePath, 'utf-8');
      const storage = JSON.parse(data);

      if (!storage?.projects || !Array.isArray(storage.projects)) {
        return 0;
      }

      const missingProjects = storage.projects.filter(
        (p: { id: string }) => !this.existingIds.has(p.id)
      );

      if (missingProjects.length === 0) {
        return 0;
      }

      console.log(`Supabase: Found ${missingProjects.length} projects in local JSON missing from Supabase`);

      const rows = missingProjects.map((p: ProjectRecord) => ({
        id: p.id,
        title: p.title,
        first_seen_at: p.firstSeenAt,
        last_confirmed_at: p.lastConfirmedAt,
        run_id: null,
        last_confirmed_run_id: null,
      }));

      const { error } = await this.client
        .from(CONFIG.SUPABASE.TABLE_NAME)
        .upsert(rows, { onConflict: 'id', ignoreDuplicates: false });

      if (error) {
        console.error('Supabase: Failed to sync missing projects:', error);
        return 0;
      }

      for (const p of missingProjects) {
        this.existingIds.add(p.id);
      }

      console.log(`Supabase: Recovery sync complete (${missingProjects.length} projects recovered)`);
      return missingProjects.length;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return 0; // No local file - nothing to sync
      }
      console.warn('Supabase: Could not sync from local storage:', error);
      return 0;
    }
  }

  /**
   * Starts a new enumeration run
   */
  async startRun(): Promise<RunInfo> {
    // Reset flush tracking for new run
    this.flushSucceeded = false;
    this.flushAttempted = false;

    const { data, error } = await this.client
      .from(CONFIG.SUPABASE.RUNS_TABLE)
      .insert({ status: 'running' })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to start run: ${error.message}`);
    }

    this.currentRunId = data.id;
    console.log(`Supabase: Started run ${this.currentRunId}`);

    return {
      id: data.id,
      startedAt: data.started_at,
    };
  }

  /**
   * Completes the current run ONLY if all flushes succeeded.
   * This is the critical atomicity gate - we never complete a run
   * that failed to flush data, ensuring we never lose projects.
   */
  async completeRun(stats: { found: number; extracted: number }): Promise<void> {
    if (!this.currentRunId) {
      console.warn('Supabase: No active run to complete');
      return;
    }

    // Final flush attempt
    await this.flush();

    // CRITICAL: Only complete if flush succeeded
    // This prevents the cleanup from running when data wasn't saved
    if (!this.flushSucceeded && this.flushAttempted) {
      console.error('Supabase: Cannot complete run - flush failed. Marking as failed to preserve data.');
      await this.failRun();
      return;
    }

    // Update run status using the atomic promote function
    const { error: promoteError } = await this.client
      .rpc('promote_run_to_current', { target_run_id: this.currentRunId });

    if (promoteError) {
      // Fallback to direct update if function doesn't exist
      const { error } = await this.client
        .from(CONFIG.SUPABASE.RUNS_TABLE)
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
          projects_found: stats.found,
          projects_extracted: stats.extracted,
        })
        .eq('id', this.currentRunId);

      if (error) {
        throw new Error(`Failed to complete run: ${error.message}`);
      }
    } else {
      // Update stats separately since promote_run_to_current doesn't set them
      await this.client
        .from(CONFIG.SUPABASE.RUNS_TABLE)
        .update({
          projects_found: stats.found,
          projects_extracted: stats.extracted,
        })
        .eq('id', this.currentRunId);
    }

    console.log(`Supabase: Completed run ${this.currentRunId} (${stats.extracted} projects)`);

    // Safe cleanup - only runs if we successfully completed
    await this.safeCleanupOldRuns();

    this.currentRunId = null;
  }

  /**
   * Marks the current run as failed.
   * Attempts to flush any buffered data before failing to preserve progress.
   * Failed runs do NOT trigger cleanup, preserving all existing data.
   */
  async failRun(): Promise<void> {
    if (!this.currentRunId) {
      return;
    }

    // Attempt to flush any buffered projects before failing
    const bufferedCount = this.buffer.size;
    if (bufferedCount > 0) {
      console.log(`Supabase: Flushing ${bufferedCount} buffered projects before marking run as failed`);
      try {
        await this.flush();
      } catch (error) {
        // Log but continue - we still want to mark the run as failed
        console.warn('Supabase: Flush before fail encountered error:', error);
      }
    }

    await this.client
      .from(CONFIG.SUPABASE.RUNS_TABLE)
      .update({
        status: 'failed',
        completed_at: new Date().toISOString(),
      })
      .eq('id', this.currentRunId);

    console.log(`Supabase: Marked run ${this.currentRunId} as failed (data preserved)`);
    this.currentRunId = null;
  }

  /**
   * Safely cleans up old runs using the database function.
   * This function ensures we never delete data from recent successful runs.
   */
  private async safeCleanupOldRuns(): Promise<void> {
    const keepCount = CONFIG.STORAGE.KEEP_RUNS;

    try {
      // Try using the safe cleanup function
      const { data, error } = await this.client
        .rpc('safe_cleanup_old_runs', { keep_count: keepCount });

      if (error) {
        // Fallback to legacy cleanup if function doesn't exist
        console.warn('Supabase: safe_cleanup_old_runs not available, using legacy cleanup');
        await this.legacyCleanupOldRuns();
        return;
      }

      if (data && data.length > 0) {
        const result = data[0];
        if (result.runs_deleted > 0 || result.projects_deleted > 0) {
          console.log(`Supabase: Cleaned up ${result.runs_deleted} old runs (${result.projects_deleted} projects)`);
        } else {
          console.log(`Supabase: No old runs to clean up (keeping ${keepCount} recent runs)`);
        }
      }
    } catch (error) {
      console.error('Supabase: Cleanup failed (data preserved):', error);
      // Cleanup failure should never cause data loss - just log and continue
    }
  }

  /**
   * Legacy cleanup for backwards compatibility.
   * Less safe than safe_cleanup_old_runs but still preserves recent data.
   */
  private async legacyCleanupOldRuns(): Promise<void> {
    const keepCount = CONFIG.STORAGE.KEEP_RUNS;

    // Get completed runs ordered by completion time
    const { data: runs, error: runsError } = await this.client
      .from(CONFIG.SUPABASE.RUNS_TABLE)
      .select('id, completed_at')
      .eq('status', 'completed')
      .order('completed_at', { ascending: false });

    if (runsError || !runs) {
      console.error('Supabase: Failed to fetch runs for cleanup:', runsError);
      return;
    }

    // Keep the most recent N runs
    const runsToDelete = runs.slice(keepCount);
    if (runsToDelete.length === 0) {
      console.log(`Supabase: No old runs to clean up (keeping ${runs.length} runs)`);
      return;
    }

    const idsToDelete = runsToDelete.map(r => r.id);

    // Delete projects ONLY if their last_confirmed_run_id is in the deletion list
    // This ensures we don't delete projects that were seen in recent runs
    const { error: projectsError, count: projectsDeleted } = await this.client
      .from(CONFIG.SUPABASE.TABLE_NAME)
      .delete({ count: 'exact' })
      .in('last_confirmed_run_id', idsToDelete);

    if (projectsError) {
      console.error('Supabase: Failed to delete old projects:', projectsError);
      return;
    }

    // Delete old run records
    const { error: runsDeleteError } = await this.client
      .from(CONFIG.SUPABASE.RUNS_TABLE)
      .delete()
      .in('id', idsToDelete);

    if (runsDeleteError) {
      console.error('Supabase: Failed to delete old runs:', runsDeleteError);
      return;
    }

    console.log(`Supabase: Cleaned up ${runsToDelete.length} old runs (${projectsDeleted ?? 0} projects)`);
  }

  /**
   * Adds or updates a project record.
   * Buffers the write and schedules a flush.
   */
  addProject(project: ProjectRecord): void {
    this.buffer.set(project.id, project);
    this.existingIds.add(project.id);
    this.scheduleFlush();
  }

  private scheduleFlush(): void {
    if (this.flushTimer) return;
    this.flushTimer = setTimeout(() => {
      this.flush().catch(console.error);
    }, CONFIG.STORAGE.FLUSH_INTERVAL);
  }

  /**
   * Flushes buffered projects to Supabase using upsert.
   * Tracks success/failure for atomicity guarantee.
   */
  async flush(): Promise<void> {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }

    const projects = Array.from(this.buffer.values());
    if (projects.length === 0) {
      // Empty flush counts as success
      this.flushSucceeded = true;
      return;
    }

    this.flushAttempted = true;

    try {
      const rows = projects.map((p) => this.toSupabaseRow(p));

      const { error } = await this.client
        .from(CONFIG.SUPABASE.TABLE_NAME)
        .upsert(rows, {
          onConflict: 'id',
          ignoreDuplicates: false,
        });

      if (error) {
        throw error;
      }

      console.log(`Supabase: Synced ${projects.length} projects`);
      this.buffer.clear();
      this.flushSucceeded = true;
    } catch (error) {
      console.error('Supabase: Failed to flush:', error);
      this.flushSucceeded = false;
      // Keep buffer for retry - DO NOT clear on failure
    }
  }

  /**
   * Converts a ProjectRecord to Supabase row format.
   * Sets both run_id (first seen) and last_confirmed_run_id (current run).
   */
  private toSupabaseRow(project: ProjectRecord): Omit<ProjectRow, 'url' | 'created_at' | 'updated_at'> {
    return {
      id: project.id,
      title: project.title,
      first_seen_at: project.firstSeenAt,
      last_confirmed_at: project.lastConfirmedAt,
      run_id: this.currentRunId, // Will be preserved on upsert for existing projects
      last_confirmed_run_id: this.currentRunId, // Always updated to current run
    };
  }

  /**
   * Returns the total count of projects (existing + buffered)
   */
  getCount(): number {
    return this.existingIds.size;
  }

  /**
   * Returns all buffered projects (pending flush)
   */
  getProjects(): ProjectRecord[] {
    return Array.from(this.buffer.values());
  }

  /**
   * Gets a single project by ID from Supabase
   */
  async getProject(id: string): Promise<ProjectRecord | undefined> {
    const { data, error } = await this.client
      .from(CONFIG.SUPABASE.TABLE_NAME)
      .select('*')
      .eq('id', id)
      .single();

    if (error || !data) return undefined;

    return this.fromSupabaseRow(data as ProjectRow);
  }

  /**
   * Converts a Supabase row to ProjectRecord format
   */
  private fromSupabaseRow(row: ProjectRow): ProjectRecord {
    return {
      id: row.id,
      title: row.title,
      firstSeenAt: row.first_seen_at,
      lastConfirmedAt: row.last_confirmed_at,
    };
  }

  /**
   * Closes the writer, flushing any pending data
   */
  async close(): Promise<void> {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    await this.flush();
  }
}

/**
 * Checks if Supabase is configured
 */
export function isSupabaseConfigured(): boolean {
  return Boolean(CONFIG.SUPABASE.URL && CONFIG.SUPABASE.ANON_KEY);
}

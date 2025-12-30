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
 * Supports run tracking for safe data management.
 */
export class SupabaseWriter implements StorageBackend {
  readonly name = 'Supabase';

  private client: SupabaseClient;
  private buffer: Map<string, ProjectRecord> = new Map();
  private existingIds: Set<string> = new Set();
  private flushTimer: NodeJS.Timeout | null = null;
  private initialized = false;
  private currentRunId: string | null = null;

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
    } catch (error) {
      console.error('Supabase: Failed to initialize:', error);
      throw error;
    }

    this.initialized = true;
  }

  /**
   * Starts a new enumeration run
   */
  async startRun(): Promise<RunInfo> {
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
   * Completes the current run and triggers cleanup
   */
  async completeRun(stats: { found: number; extracted: number }): Promise<void> {
    if (!this.currentRunId) {
      console.warn('Supabase: No active run to complete');
      return;
    }

    // Flush any pending data first
    await this.flush();

    // Update run status
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

    console.log(`Supabase: Completed run ${this.currentRunId} (${stats.extracted} projects)`);

    // Clean up old runs
    await this.cleanupOldRuns();

    this.currentRunId = null;
  }

  /**
   * Marks the current run as failed
   */
  async failRun(): Promise<void> {
    if (!this.currentRunId) {
      return;
    }

    await this.client
      .from(CONFIG.SUPABASE.RUNS_TABLE)
      .update({
        status: 'failed',
        completed_at: new Date().toISOString(),
      })
      .eq('id', this.currentRunId);

    console.log(`Supabase: Marked run ${this.currentRunId} as failed`);
    this.currentRunId = null;
  }

  /**
   * Cleans up old runs, keeping only the most recent N completed runs
   */
  private async cleanupOldRuns(): Promise<void> {
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

    // Delete projects from old runs
    const { error: projectsError, count: projectsDeleted } = await this.client
      .from(CONFIG.SUPABASE.TABLE_NAME)
      .delete({ count: 'exact' })
      .in('run_id', idsToDelete);

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

    console.log(`Supabase: Cleaned up ${runsToDelete.length} old runs (${projectsDeleted} projects)`);
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
   */
  async flush(): Promise<void> {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }

    const projects = Array.from(this.buffer.values());
    if (projects.length === 0) return;

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
    } catch (error) {
      console.error('Supabase: Failed to flush:', error);
      // Keep buffer for retry
    }
  }

  /**
   * Converts a ProjectRecord to Supabase row format
   */
  private toSupabaseRow(project: ProjectRecord): Omit<ProjectRow, 'url' | 'created_at' | 'updated_at'> {
    return {
      id: project.id,
      title: project.title,
      first_seen_at: project.firstSeenAt,
      last_confirmed_at: project.lastConfirmedAt,
      run_id: this.currentRunId,
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

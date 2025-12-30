/**
 * Storage layer exports and factory
 */

export type { StorageBackend, RunInfo } from './types.js';
export { ProjectWriter } from './writer.js';
export { SupabaseWriter, isSupabaseConfigured } from './supabase.js';
export { createEmptyStorage, isValidStorageFile, isValidProjectRecord } from './schema.js';

import type { StorageBackend } from './types.js';
import { ProjectWriter } from './writer.js';
import { SupabaseWriter, isSupabaseConfigured } from './supabase.js';

/**
 * Creates storage backends based on configuration.
 * Always includes local JSON storage, adds Supabase if configured.
 *
 * @param outputPath - Optional path for local JSON storage
 * @returns Array of storage backends
 */
export function createStorageBackends(outputPath?: string): StorageBackend[] {
  const backends: StorageBackend[] = [];

  // Always include local storage for redundancy
  backends.push(new ProjectWriter(outputPath));

  // Add Supabase if configured
  if (isSupabaseConfigured()) {
    backends.push(new SupabaseWriter());
    console.log('Storage: Supabase backend enabled');
  }

  return backends;
}

/**
 * Initializes all storage backends
 */
export async function initializeBackends(
  backends: StorageBackend[]
): Promise<void> {
  await Promise.all(backends.map((b) => b.initialize()));
}

/**
 * Starts a new run on all backends that support it
 */
export async function startRun(
  backends: StorageBackend[]
): Promise<void> {
  await Promise.all(
    backends.map((b) => b.startRun?.())
  );
}

/**
 * Completes the current run on all backends that support it
 */
export async function completeRun(
  backends: StorageBackend[],
  stats: { found: number; extracted: number }
): Promise<void> {
  await Promise.all(
    backends.map((b) => b.completeRun?.(stats))
  );
}

/**
 * Marks the current run as failed on all backends that support it
 */
export async function failRun(
  backends: StorageBackend[]
): Promise<void> {
  await Promise.all(
    backends.map((b) => b.failRun?.())
  );
}

/**
 * Closes all storage backends
 */
export async function closeBackends(
  backends: StorageBackend[]
): Promise<void> {
  await Promise.all(backends.map((b) => b.close()));
}

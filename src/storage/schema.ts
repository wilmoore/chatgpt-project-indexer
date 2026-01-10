import { ProjectRecord, StorageFile } from '../types/index.js';

/**
 * Current storage schema version
 */
export const STORAGE_VERSION = 1 as const;

/**
 * Creates an empty storage file structure
 */
export function createEmptyStorage(): StorageFile {
  return {
    version: STORAGE_VERSION,
    lastUpdatedAt: new Date().toISOString(),
    projects: [],
  };
}

/**
 * Validates storage file structure
 */
export function isValidStorageFile(data: unknown): data is StorageFile {
  if (typeof data !== 'object' || data === null) {
    return false;
  }

  const obj = data as Record<string, unknown>;

  return (
    obj.version === STORAGE_VERSION &&
    typeof obj.lastUpdatedAt === 'string' &&
    Array.isArray(obj.projects)
  );
}

/**
 * Validates a project record structure
 */
export function isValidProjectRecord(data: unknown): data is ProjectRecord {
  if (typeof data !== 'object' || data === null) {
    return false;
  }

  const obj = data as Record<string, unknown>;

  // Required fields
  const hasRequiredFields =
    typeof obj.id === 'string' &&
    typeof obj.title === 'string' &&
    typeof obj.firstSeenAt === 'string' &&
    typeof obj.lastConfirmedAt === 'string';

  if (!hasRequiredFields) return false;

  // Optional fields validation (if present, must be correct type)
  if (obj.pinned !== undefined && typeof obj.pinned !== 'boolean') return false;
  if (obj.pinnedAt !== undefined && typeof obj.pinnedAt !== 'string') return false;
  if (obj.iconColor !== undefined && typeof obj.iconColor !== 'string') return false;
  if (obj.iconEmoji !== undefined && typeof obj.iconEmoji !== 'string') return false;

  return true;
}

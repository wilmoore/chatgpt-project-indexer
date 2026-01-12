import { describe, it, expect } from 'vitest';
import {
  STORAGE_VERSION,
  createEmptyStorage,
  isValidStorageFile,
  isValidProjectRecord,
} from '../../src/storage/schema.js';

describe('STORAGE_VERSION', () => {
  it('is version 1', () => {
    expect(STORAGE_VERSION).toBe(1);
  });
});

describe('createEmptyStorage', () => {
  it('returns valid storage structure', () => {
    const storage = createEmptyStorage();

    expect(storage.version).toBe(1);
    expect(storage.projects).toEqual([]);
    expect(storage.lastUpdatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  it('creates fresh instances', () => {
    const storage1 = createEmptyStorage();
    const storage2 = createEmptyStorage();

    expect(storage1).not.toBe(storage2);
    expect(storage1.projects).not.toBe(storage2.projects);
  });
});

describe('isValidStorageFile', () => {
  it('returns true for valid storage file', () => {
    const valid = {
      version: 1,
      lastUpdatedAt: '2026-01-11T00:00:00.000Z',
      projects: [],
    };

    expect(isValidStorageFile(valid)).toBe(true);
  });

  it('returns true for storage file with projects', () => {
    const valid = {
      version: 1,
      lastUpdatedAt: '2026-01-11T00:00:00.000Z',
      projects: [
        {
          id: 'test-id',
          title: 'Test Project',
          firstSeenAt: '2026-01-11T00:00:00.000Z',
          lastConfirmedAt: '2026-01-11T00:00:00.000Z',
        },
      ],
    };

    expect(isValidStorageFile(valid)).toBe(true);
  });

  describe('invalid inputs', () => {
    it('returns false for null', () => {
      expect(isValidStorageFile(null)).toBe(false);
    });

    it('returns false for undefined', () => {
      expect(isValidStorageFile(undefined)).toBe(false);
    });

    it('returns false for string', () => {
      expect(isValidStorageFile('string')).toBe(false);
    });

    it('returns false for number', () => {
      expect(isValidStorageFile(123)).toBe(false);
    });

    it('returns false for wrong version', () => {
      const invalid = {
        version: 2,
        lastUpdatedAt: '2026-01-11T00:00:00.000Z',
        projects: [],
      };
      expect(isValidStorageFile(invalid)).toBe(false);
    });

    it('returns false for missing version', () => {
      const invalid = {
        lastUpdatedAt: '2026-01-11T00:00:00.000Z',
        projects: [],
      };
      expect(isValidStorageFile(invalid)).toBe(false);
    });

    it('returns false for missing lastUpdatedAt', () => {
      const invalid = {
        version: 1,
        projects: [],
      };
      expect(isValidStorageFile(invalid)).toBe(false);
    });

    it('returns false for non-string lastUpdatedAt', () => {
      const invalid = {
        version: 1,
        lastUpdatedAt: 12345,
        projects: [],
      };
      expect(isValidStorageFile(invalid)).toBe(false);
    });

    it('returns false for missing projects', () => {
      const invalid = {
        version: 1,
        lastUpdatedAt: '2026-01-11T00:00:00.000Z',
      };
      expect(isValidStorageFile(invalid)).toBe(false);
    });

    it('returns false for non-array projects', () => {
      const invalid = {
        version: 1,
        lastUpdatedAt: '2026-01-11T00:00:00.000Z',
        projects: 'not-an-array',
      };
      expect(isValidStorageFile(invalid)).toBe(false);
    });
  });
});

describe('isValidProjectRecord', () => {
  const validProject = {
    id: 'test-id',
    title: 'Test Project',
    firstSeenAt: '2026-01-11T00:00:00.000Z',
    lastConfirmedAt: '2026-01-11T00:00:00.000Z',
  };

  it('returns true for minimal valid project', () => {
    expect(isValidProjectRecord(validProject)).toBe(true);
  });

  it('returns true for project with all optional fields', () => {
    const fullProject = {
      ...validProject,
      pinned: true,
      pinnedAt: '2026-01-11T00:00:00.000Z',
      iconColor: '#ff66ad',
      iconEmoji: 'graduation-cap',
    };
    expect(isValidProjectRecord(fullProject)).toBe(true);
  });

  describe('required fields', () => {
    it('returns false for missing id', () => {
      const { id, ...noId } = validProject;
      expect(isValidProjectRecord(noId)).toBe(false);
    });

    it('returns false for missing title', () => {
      const { title, ...noTitle } = validProject;
      expect(isValidProjectRecord(noTitle)).toBe(false);
    });

    it('returns false for missing firstSeenAt', () => {
      const { firstSeenAt, ...noFirstSeen } = validProject;
      expect(isValidProjectRecord(noFirstSeen)).toBe(false);
    });

    it('returns false for missing lastConfirmedAt', () => {
      const { lastConfirmedAt, ...noLastConfirmed } = validProject;
      expect(isValidProjectRecord(noLastConfirmed)).toBe(false);
    });

    it('returns false for non-string id', () => {
      const invalid = { ...validProject, id: 123 };
      expect(isValidProjectRecord(invalid)).toBe(false);
    });

    it('returns false for non-string title', () => {
      const invalid = { ...validProject, title: 123 };
      expect(isValidProjectRecord(invalid)).toBe(false);
    });
  });

  describe('optional fields validation', () => {
    it('returns false for non-boolean pinned', () => {
      const invalid = { ...validProject, pinned: 'yes' };
      expect(isValidProjectRecord(invalid)).toBe(false);
    });

    it('returns false for non-string pinnedAt', () => {
      const invalid = { ...validProject, pinnedAt: 12345 };
      expect(isValidProjectRecord(invalid)).toBe(false);
    });

    it('returns false for non-string iconColor', () => {
      const invalid = { ...validProject, iconColor: 12345 };
      expect(isValidProjectRecord(invalid)).toBe(false);
    });

    it('returns false for non-string iconEmoji', () => {
      const invalid = { ...validProject, iconEmoji: 12345 };
      expect(isValidProjectRecord(invalid)).toBe(false);
    });
  });

  describe('invalid inputs', () => {
    it('returns false for null', () => {
      expect(isValidProjectRecord(null)).toBe(false);
    });

    it('returns false for undefined', () => {
      expect(isValidProjectRecord(undefined)).toBe(false);
    });

    it('returns false for empty object', () => {
      expect(isValidProjectRecord({})).toBe(false);
    });
  });
});

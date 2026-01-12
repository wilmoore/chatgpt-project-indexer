import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { ProjectWriter } from '../../src/storage/writer.js';
import { isValidStorageFile, isValidProjectRecord } from '../../src/storage/schema.js';
import type { ProjectRecord } from '../../src/types/index.js';

describe('Storage Integration', () => {
  let tempDir: string;
  let testOutputPath: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'storage-integration-'));
    testOutputPath = path.join(tempDir, 'projects.json');
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  const createProject = (id: string, title: string, pinned = false): ProjectRecord => ({
    id,
    title,
    firstSeenAt: new Date().toISOString(),
    lastConfirmedAt: new Date().toISOString(),
    ...(pinned && { pinned: true, pinnedAt: new Date().toISOString() }),
  });

  describe('full storage lifecycle', () => {
    it('writes, reads, and validates storage file', async () => {
      // Phase 1: Write projects
      const writer1 = new ProjectWriter(testOutputPath);
      await writer1.initialize();

      writer1.addProject(createProject('proj-1', 'Project One'));
      writer1.addProject(createProject('proj-2', 'Project Two'));
      await writer1.close();

      // Phase 2: Read and validate file
      const content = await fs.readFile(testOutputPath, 'utf-8');
      const data = JSON.parse(content);

      expect(isValidStorageFile(data)).toBe(true);
      expect(data.projects).toHaveLength(2);

      // Phase 3: Reload into new writer
      const writer2 = new ProjectWriter(testOutputPath);
      await writer2.initialize();

      expect(writer2.getCount()).toBe(2);
      expect(writer2.getProject('proj-1')?.title).toBe('Project One');
      expect(writer2.getProject('proj-2')?.title).toBe('Project Two');
    });

    it('preserves data across multiple sessions', async () => {
      // Session 1: Initial write
      const writer1 = new ProjectWriter(testOutputPath);
      await writer1.initialize();
      writer1.addProject(createProject('proj-1', 'Original'));
      await writer1.close();

      // Session 2: Update existing + add new
      const writer2 = new ProjectWriter(testOutputPath);
      await writer2.initialize();
      writer2.addProject({
        ...createProject('proj-1', 'Updated'),
        lastConfirmedAt: new Date().toISOString(),
      });
      writer2.addProject(createProject('proj-2', 'New Project'));
      await writer2.close();

      // Session 3: Verify all data
      const writer3 = new ProjectWriter(testOutputPath);
      await writer3.initialize();

      expect(writer3.getCount()).toBe(2);
      expect(writer3.getProject('proj-1')?.title).toBe('Updated');
      expect(writer3.getProject('proj-2')?.title).toBe('New Project');
    });
  });

  describe('pinned projects workflow', () => {
    it('tracks and retrieves pinned projects', async () => {
      const writer = new ProjectWriter(testOutputPath);
      await writer.initialize();

      // Add mix of pinned and unpinned
      writer.addProject(createProject('proj-1', 'Not Pinned'));
      writer.addProject(createProject('proj-2', 'Pinned Early', true));
      writer.addProject(createProject('proj-3', 'Also Not Pinned'));

      // Add a later pinned project
      await new Promise(resolve => setTimeout(resolve, 10)); // Small delay for different timestamp
      writer.addProject(createProject('proj-4', 'Pinned Later', true));

      await writer.flush();

      // Verify pinned retrieval
      const pinned = writer.getPinnedProjects();
      expect(pinned).toHaveLength(2);
      expect(pinned[0].id).toBe('proj-2'); // Earlier pinned first
      expect(pinned[1].id).toBe('proj-4');
    });

    it('preserves pin state through update', async () => {
      const writer = new ProjectWriter(testOutputPath);
      await writer.initialize();

      // Add pinned project
      writer.addProject({
        ...createProject('proj-1', 'Pinned'),
        pinned: true,
        pinnedAt: '2026-01-01T00:00:00.000Z',
      });
      await writer.flush();

      // Update without pin info
      writer.addProject(createProject('proj-1', 'Updated Title'));
      await writer.close();

      // Verify pin state preserved
      const writer2 = new ProjectWriter(testOutputPath);
      await writer2.initialize();

      const project = writer2.getProject('proj-1');
      expect(project?.pinned).toBe(true);
      expect(project?.pinnedAt).toBe('2026-01-01T00:00:00.000Z');
      expect(project?.title).toBe('Updated Title');
    });
  });

  describe('concurrent write safety', () => {
    it('handles rapid sequential writes', async () => {
      const writer = new ProjectWriter(testOutputPath);
      await writer.initialize();

      // Rapid sequential additions
      for (let i = 0; i < 100; i++) {
        writer.addProject(createProject(`proj-${i}`, `Project ${i}`));
      }

      await writer.close();

      // Verify all saved
      const content = await fs.readFile(testOutputPath, 'utf-8');
      const data = JSON.parse(content);
      expect(data.projects).toHaveLength(100);
    });
  });

  describe('project record validation', () => {
    it('all persisted records are valid', async () => {
      const writer = new ProjectWriter(testOutputPath);
      await writer.initialize();

      writer.addProject(createProject('proj-1', 'Test', false));
      writer.addProject({
        ...createProject('proj-2', 'Pinned'),
        pinned: true,
        pinnedAt: new Date().toISOString(),
        iconColor: '#ff66ad',
        iconEmoji: 'graduation-cap',
      });

      await writer.close();

      // Validate each record
      const content = await fs.readFile(testOutputPath, 'utf-8');
      const data = JSON.parse(content);

      for (const project of data.projects) {
        expect(isValidProjectRecord(project)).toBe(true);
      }
    });
  });

  describe('error recovery', () => {
    it('handles corrupted storage gracefully', async () => {
      // Write corrupted data
      await fs.writeFile(testOutputPath, '{ invalid json }}}');

      // Should not throw, starts fresh
      const writer = new ProjectWriter(testOutputPath);
      await writer.initialize();

      expect(writer.getCount()).toBe(0);

      // Should be able to write new data
      writer.addProject(createProject('proj-1', 'New'));
      await writer.close();

      // Verify recovery
      const content = await fs.readFile(testOutputPath, 'utf-8');
      const data = JSON.parse(content);
      expect(isValidStorageFile(data)).toBe(true);
    });

    it('handles missing directory', async () => {
      const nestedPath = path.join(tempDir, 'deep', 'nested', 'projects.json');

      const writer = new ProjectWriter(nestedPath);
      await writer.initialize();
      writer.addProject(createProject('proj-1', 'Test'));
      await writer.close();

      // Verify file created with directory
      const content = await fs.readFile(nestedPath, 'utf-8');
      const data = JSON.parse(content);
      expect(data.projects).toHaveLength(1);
    });
  });
});

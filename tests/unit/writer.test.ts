import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { ProjectWriter } from '../../src/storage/writer.js';
import type { ProjectRecord } from '../../src/types/index.js';

describe('ProjectWriter', () => {
  let tempDir: string;
  let testOutputPath: string;

  beforeEach(async () => {
    // Create temp directory for test files
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'writer-test-'));
    testOutputPath = path.join(tempDir, 'projects.json');
  });

  afterEach(async () => {
    // Cleanup temp directory
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  const createTestProject = (id: string, title: string): ProjectRecord => ({
    id,
    title,
    firstSeenAt: '2026-01-11T00:00:00.000Z',
    lastConfirmedAt: '2026-01-11T00:00:00.000Z',
  });

  describe('initialization', () => {
    it('starts with empty buffer', () => {
      const writer = new ProjectWriter(testOutputPath);
      expect(writer.getCount()).toBe(0);
    });

    it('loads existing valid storage on initialize', async () => {
      // Pre-create a storage file
      const existingData = {
        version: 1,
        lastUpdatedAt: '2026-01-10T00:00:00.000Z',
        projects: [createTestProject('existing-1', 'Existing Project')],
      };
      await fs.writeFile(testOutputPath, JSON.stringify(existingData));

      const writer = new ProjectWriter(testOutputPath);
      await writer.initialize();

      expect(writer.getCount()).toBe(1);
      expect(writer.getProject('existing-1')).toBeDefined();
    });

    it('starts fresh when file does not exist', async () => {
      const writer = new ProjectWriter(testOutputPath);
      await writer.initialize();

      expect(writer.getCount()).toBe(0);
    });

    it('starts fresh when file is invalid JSON', async () => {
      await fs.writeFile(testOutputPath, 'not json');

      const writer = new ProjectWriter(testOutputPath);
      await writer.initialize();

      expect(writer.getCount()).toBe(0);
    });
  });

  describe('addProject', () => {
    it('adds new project to buffer', async () => {
      const writer = new ProjectWriter(testOutputPath);
      await writer.initialize();

      const project = createTestProject('proj-1', 'Test Project');
      writer.addProject(project);

      expect(writer.getCount()).toBe(1);
      expect(writer.getProject('proj-1')).toEqual(project);
    });

    it('deduplicates by ID', async () => {
      const writer = new ProjectWriter(testOutputPath);
      await writer.initialize();

      const project1 = createTestProject('proj-1', 'Test Project');
      const project2 = { ...createTestProject('proj-1', 'Updated Title'), lastConfirmedAt: '2026-01-12T00:00:00.000Z' };

      writer.addProject(project1);
      writer.addProject(project2);

      expect(writer.getCount()).toBe(1);
      // Title should be updated
      expect(writer.getProject('proj-1')?.title).toBe('Updated Title');
      // But firstSeenAt should be preserved
      expect(writer.getProject('proj-1')?.firstSeenAt).toBe('2026-01-11T00:00:00.000Z');
    });

    it('preserves firstSeenAt on update', async () => {
      const writer = new ProjectWriter(testOutputPath);
      await writer.initialize();

      const original = createTestProject('proj-1', 'Original');
      const update = {
        ...createTestProject('proj-1', 'Updated'),
        firstSeenAt: '2026-01-12T00:00:00.000Z', // Attempt to change
      };

      writer.addProject(original);
      writer.addProject(update);

      expect(writer.getProject('proj-1')?.firstSeenAt).toBe('2026-01-11T00:00:00.000Z');
    });

    it('preserves pin state on update', async () => {
      const writer = new ProjectWriter(testOutputPath);
      await writer.initialize();

      const original = {
        ...createTestProject('proj-1', 'Original'),
        pinned: true,
        pinnedAt: '2026-01-10T00:00:00.000Z',
      };
      const update = createTestProject('proj-1', 'Updated');

      writer.addProject(original);
      writer.addProject(update);

      const result = writer.getProject('proj-1');
      expect(result?.pinned).toBe(true);
      expect(result?.pinnedAt).toBe('2026-01-10T00:00:00.000Z');
    });

    it('preserves icon info on update when not provided', async () => {
      const writer = new ProjectWriter(testOutputPath);
      await writer.initialize();

      const original = {
        ...createTestProject('proj-1', 'Original'),
        iconColor: '#ff66ad',
        iconEmoji: 'graduation-cap',
      };
      const update = createTestProject('proj-1', 'Updated');

      writer.addProject(original);
      writer.addProject(update);

      const result = writer.getProject('proj-1');
      expect(result?.iconColor).toBe('#ff66ad');
      expect(result?.iconEmoji).toBe('graduation-cap');
    });
  });

  describe('flush', () => {
    it('writes buffered data to file', async () => {
      const writer = new ProjectWriter(testOutputPath);
      await writer.initialize();

      writer.addProject(createTestProject('proj-1', 'Test Project'));
      await writer.flush();

      const content = await fs.readFile(testOutputPath, 'utf-8');
      const data = JSON.parse(content);

      expect(data.version).toBe(1);
      expect(data.projects).toHaveLength(1);
      expect(data.projects[0].id).toBe('proj-1');
    });

    it('creates parent directories if needed', async () => {
      const nestedPath = path.join(tempDir, 'nested', 'deep', 'projects.json');
      const writer = new ProjectWriter(nestedPath);
      await writer.initialize();

      writer.addProject(createTestProject('proj-1', 'Test'));
      await writer.flush();

      const exists = await fs.access(nestedPath).then(() => true).catch(() => false);
      expect(exists).toBe(true);
    });

    it('writes atomically via temp file', async () => {
      const writer = new ProjectWriter(testOutputPath);
      await writer.initialize();

      writer.addProject(createTestProject('proj-1', 'Test'));
      await writer.flush();

      // Verify no temp file left behind
      const tempPath = `${testOutputPath}.tmp`;
      const tempExists = await fs.access(tempPath).then(() => true).catch(() => false);
      expect(tempExists).toBe(false);
    });
  });

  describe('getProjects', () => {
    it('returns all buffered projects', async () => {
      const writer = new ProjectWriter(testOutputPath);
      await writer.initialize();

      writer.addProject(createTestProject('proj-1', 'Project 1'));
      writer.addProject(createTestProject('proj-2', 'Project 2'));

      const projects = writer.getProjects();
      expect(projects).toHaveLength(2);
      expect(projects.map(p => p.id).sort()).toEqual(['proj-1', 'proj-2']);
    });
  });

  describe('getPinnedProjects', () => {
    it('returns only pinned projects', async () => {
      const writer = new ProjectWriter(testOutputPath);
      await writer.initialize();

      writer.addProject(createTestProject('proj-1', 'Not Pinned'));
      writer.addProject({
        ...createTestProject('proj-2', 'Pinned'),
        pinned: true,
        pinnedAt: '2026-01-10T00:00:00.000Z',
      });

      const pinned = writer.getPinnedProjects();
      expect(pinned).toHaveLength(1);
      expect(pinned[0].id).toBe('proj-2');
    });

    it('sorts by pinnedAt ascending', async () => {
      const writer = new ProjectWriter(testOutputPath);
      await writer.initialize();

      writer.addProject({
        ...createTestProject('proj-2', 'Second'),
        pinned: true,
        pinnedAt: '2026-01-12T00:00:00.000Z',
      });
      writer.addProject({
        ...createTestProject('proj-1', 'First'),
        pinned: true,
        pinnedAt: '2026-01-10T00:00:00.000Z',
      });

      const pinned = writer.getPinnedProjects();
      expect(pinned[0].id).toBe('proj-1');
      expect(pinned[1].id).toBe('proj-2');
    });
  });

  describe('close', () => {
    it('flushes pending data', async () => {
      const writer = new ProjectWriter(testOutputPath);
      await writer.initialize();

      writer.addProject(createTestProject('proj-1', 'Test'));
      await writer.close();

      const content = await fs.readFile(testOutputPath, 'utf-8');
      const data = JSON.parse(content);
      expect(data.projects).toHaveLength(1);
    });
  });
});

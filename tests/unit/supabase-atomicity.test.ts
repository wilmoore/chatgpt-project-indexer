import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Unit tests for Supabase atomicity guarantees.
 *
 * These tests verify that:
 * 1. Failed flushes prevent run completion (protecting data)
 * 2. Cleanup only runs after successful completion
 * 3. Projects are tagged with last_confirmed_run_id for safe cleanup
 */

// Mock the Supabase client
const mockUpsert = vi.fn();
const mockUpdate = vi.fn();
const mockRpc = vi.fn();
const mockInsert = vi.fn();
const mockSelect = vi.fn();
const mockSingle = vi.fn();
const mockEq = vi.fn();
const mockFrom = vi.fn();

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: mockFrom,
    rpc: mockRpc,
  }),
}));

// Import after mocking
import { SupabaseWriter } from '../../src/storage/supabase.js';

describe('Supabase Atomicity', () => {
  let writer: SupabaseWriter;

  beforeEach(() => {
    vi.clearAllMocks();

    // Setup default mock chain
    mockFrom.mockImplementation(() => ({
      select: mockSelect,
      insert: mockInsert,
      update: mockUpdate,
      upsert: mockUpsert,
      delete: vi.fn().mockReturnThis(),
      eq: mockEq,
      in: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
    }));

    mockSelect.mockReturnValue({
      eq: mockEq,
      single: mockSingle,
      order: vi.fn().mockResolvedValue({ data: [], error: null }),
    });

    mockInsert.mockReturnValue({
      select: () => ({
        single: () => Promise.resolve({
          data: { id: 'run-123', started_at: new Date().toISOString() },
          error: null,
        }),
      }),
    });

    mockUpdate.mockReturnValue({
      eq: () => Promise.resolve({ error: null }),
    });

    mockEq.mockReturnValue({
      single: () => Promise.resolve({ data: null, error: null }),
    });

    mockRpc.mockResolvedValue({ data: [{ runs_deleted: 0, projects_deleted: 0 }], error: null });

    writer = new SupabaseWriter();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('flush tracking', () => {
    it('tracks flush success state', async () => {
      // Setup: successful flush
      mockUpsert.mockResolvedValue({ error: null });

      // Initialize (empty projects)
      mockSelect.mockReturnValueOnce({
        eq: mockEq,
        single: mockSingle,
        order: vi.fn().mockResolvedValue({ data: [], error: null }),
      });
      await writer.initialize();

      // Start run
      await writer.startRun();

      // Add and flush project
      writer.addProject({
        id: 'proj-1',
        title: 'Test',
        firstSeenAt: new Date().toISOString(),
        lastConfirmedAt: new Date().toISOString(),
      });

      await writer.flush();

      // Flush should have been called
      expect(mockUpsert).toHaveBeenCalled();
    });

    it('marks flush as failed when upsert fails', async () => {
      // Setup: failed flush
      mockUpsert.mockResolvedValue({
        error: { code: 'PGRST204', message: "Could not find the 'icon_color' column" },
      });

      mockSelect.mockReturnValueOnce({
        eq: mockEq,
        single: mockSingle,
        order: vi.fn().mockResolvedValue({ data: [], error: null }),
      });
      await writer.initialize();
      await writer.startRun();

      writer.addProject({
        id: 'proj-1',
        title: 'Test',
        firstSeenAt: new Date().toISOString(),
        lastConfirmedAt: new Date().toISOString(),
      });

      // Flush should fail but not throw
      await writer.flush();

      // Buffer should be preserved for retry
      expect(writer.getProjects()).toHaveLength(1);
    });
  });

  describe('run completion atomicity', () => {
    it('fails run when flush failed instead of completing', async () => {
      // Setup: flush will fail
      mockUpsert.mockResolvedValue({
        error: { code: 'PGRST204', message: 'Column not found' },
      });

      mockSelect.mockReturnValueOnce({
        eq: mockEq,
        single: mockSingle,
        order: vi.fn().mockResolvedValue({ data: [], error: null }),
      });
      await writer.initialize();
      await writer.startRun();

      writer.addProject({
        id: 'proj-1',
        title: 'Test',
        firstSeenAt: new Date().toISOString(),
        lastConfirmedAt: new Date().toISOString(),
      });

      // First flush fails
      await writer.flush();

      // Complete run should see flush failed and mark as failed
      await writer.completeRun({ found: 1, extracted: 1 });

      // Should have called update with 'failed' status
      expect(mockUpdate).toHaveBeenCalled();

      // Cleanup (rpc) should NOT have been called because run failed
      expect(mockRpc).not.toHaveBeenCalledWith('safe_cleanup_old_runs', expect.anything());
    });

    it('completes run and triggers cleanup when flush succeeded', async () => {
      // Setup: flush will succeed
      mockUpsert.mockResolvedValue({ error: null });

      mockSelect.mockReturnValueOnce({
        eq: mockEq,
        single: mockSingle,
        order: vi.fn().mockResolvedValue({ data: [], error: null }),
      });
      await writer.initialize();
      await writer.startRun();

      writer.addProject({
        id: 'proj-1',
        title: 'Test',
        firstSeenAt: new Date().toISOString(),
        lastConfirmedAt: new Date().toISOString(),
      });

      // Complete run (which does final flush)
      await writer.completeRun({ found: 1, extracted: 1 });

      // Should have called promote_run_to_current or update with 'completed'
      expect(mockRpc).toHaveBeenCalledWith('promote_run_to_current', expect.anything());
    });
  });

  describe('project row format', () => {
    it('includes last_confirmed_run_id in upsert', async () => {
      mockUpsert.mockResolvedValue({ error: null });

      mockSelect.mockReturnValueOnce({
        eq: mockEq,
        single: mockSingle,
        order: vi.fn().mockResolvedValue({ data: [], error: null }),
      });
      await writer.initialize();
      await writer.startRun();

      writer.addProject({
        id: 'proj-1',
        title: 'Test',
        firstSeenAt: new Date().toISOString(),
        lastConfirmedAt: new Date().toISOString(),
      });

      await writer.flush();

      // Verify the upsert includes last_confirmed_run_id
      expect(mockUpsert).toHaveBeenCalled();
      const upsertCall = mockUpsert.mock.calls[0];
      const rows = upsertCall[0];

      expect(rows[0]).toHaveProperty('last_confirmed_run_id');
      expect(rows[0].last_confirmed_run_id).toBe('run-123');
    });
  });

  describe('buffer preservation on failure', () => {
    it('preserves buffer when flush fails', async () => {
      mockUpsert.mockResolvedValue({
        error: { code: 'ERROR', message: 'Connection failed' },
      });

      mockSelect.mockReturnValueOnce({
        eq: mockEq,
        single: mockSingle,
        order: vi.fn().mockResolvedValue({ data: [], error: null }),
      });
      await writer.initialize();
      await writer.startRun();

      writer.addProject({
        id: 'proj-1',
        title: 'Test',
        firstSeenAt: new Date().toISOString(),
        lastConfirmedAt: new Date().toISOString(),
      });

      await writer.flush();

      // Buffer should still have the project for retry
      expect(writer.getProjects()).toHaveLength(1);
      expect(writer.getProjects()[0].id).toBe('proj-1');
    });

    it('clears buffer when flush succeeds', async () => {
      mockUpsert.mockResolvedValue({ error: null });

      mockSelect.mockReturnValueOnce({
        eq: mockEq,
        single: mockSingle,
        order: vi.fn().mockResolvedValue({ data: [], error: null }),
      });
      await writer.initialize();
      await writer.startRun();

      writer.addProject({
        id: 'proj-1',
        title: 'Test',
        firstSeenAt: new Date().toISOString(),
        lastConfirmedAt: new Date().toISOString(),
      });

      await writer.flush();

      // Buffer should be cleared after successful flush
      expect(writer.getProjects()).toHaveLength(0);
    });
  });
});

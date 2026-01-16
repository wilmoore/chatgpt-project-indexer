import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Unit tests for Touch Queue Processor
 *
 * Tests the queue-based touch system that allows external clients
 * (like Raycast) to trigger touch operations via the REST API.
 */

// Mock Supabase client
const mockFrom = vi.fn();
const mockSelect = vi.fn();
const mockInsert = vi.fn();
const mockUpdate = vi.fn();
const mockEq = vi.fn();
const mockOrder = vi.fn();
const mockLimit = vi.fn();
const mockRpc = vi.fn();

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: mockFrom,
    rpc: mockRpc,
  }),
}));

// Import after mocking
import { TouchQueueProcessor, createTouchQueueProcessor } from '../../src/touch/queue-processor.js';
import type { TouchMechanism, TouchResult } from '../../src/touch/types.js';

// Mock touch mechanism
const createMockMechanism = (shouldSucceed = true): TouchMechanism => ({
  name: 'mock',
  touch: vi.fn().mockResolvedValue({
    projectId: 'test-id',
    success: shouldSucceed,
    error: shouldSucceed ? undefined : 'Touch failed',
  } as TouchResult),
});

// Mock Playwright page
const createMockPage = () => ({
  evaluate: vi.fn(),
});

describe('TouchQueueProcessor', () => {
  let processor: TouchQueueProcessor;

  beforeEach(() => {
    vi.clearAllMocks();

    // Setup default mock chain for Supabase
    mockFrom.mockImplementation(() => ({
      select: mockSelect,
      insert: mockInsert,
      update: mockUpdate,
    }));

    mockSelect.mockReturnValue({
      eq: mockEq,
      order: mockOrder,
    });

    mockEq.mockReturnValue({
      order: mockOrder,
    });

    mockOrder.mockReturnValue({
      limit: mockLimit,
    });

    mockLimit.mockResolvedValue({
      data: [],
      error: null,
    });

    mockUpdate.mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    });

    mockRpc.mockResolvedValue({ error: null });

    processor = createTouchQueueProcessor();
  });

  afterEach(() => {
    processor.stopPolling();
    vi.restoreAllMocks();
  });

  describe('processQueue', () => {
    it('returns empty result when no pending requests', async () => {
      mockLimit.mockResolvedValue({ data: [], error: null });

      const page = createMockPage();
      const mechanism = createMockMechanism();

      const result = await processor.processQueue(page as any, mechanism);

      expect(result.processed).toBe(0);
      expect(result.succeeded).toBe(0);
      expect(result.failed).toBe(0);
      expect(result.errors).toHaveLength(0);
    });

    it('processes pending requests and updates status', async () => {
      const pendingRequest = {
        id: 1,
        project_id: 'g-p-test123',
        status: 'pending',
        created_at: new Date().toISOString(),
      };

      mockLimit.mockResolvedValue({ data: [pendingRequest], error: null });

      const page = createMockPage();
      const mechanism = createMockMechanism(true);

      const result = await processor.processQueue(page as any, mechanism);

      expect(result.processed).toBe(1);
      expect(result.succeeded).toBe(1);
      expect(result.failed).toBe(0);
      expect(mechanism.touch).toHaveBeenCalledWith(
        page,
        expect.objectContaining({ id: 'g-p-test123' })
      );
    });

    it('handles failed touch operations', async () => {
      const pendingRequest = {
        id: 1,
        project_id: 'g-p-test123',
        status: 'pending',
        created_at: new Date().toISOString(),
      };

      mockLimit.mockResolvedValue({ data: [pendingRequest], error: null });

      const page = createMockPage();
      const mechanism = createMockMechanism(false);

      const result = await processor.processQueue(page as any, mechanism);

      expect(result.processed).toBe(1);
      expect(result.succeeded).toBe(0);
      expect(result.failed).toBe(1);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toEqual({
        requestId: 1,
        projectId: 'g-p-test123',
        error: 'Touch failed',
      });
    });

    it('processes multiple requests in order', async () => {
      const requests = [
        { id: 1, project_id: 'g-p-first', status: 'pending', created_at: '2026-01-01' },
        { id: 2, project_id: 'g-p-second', status: 'pending', created_at: '2026-01-02' },
        { id: 3, project_id: 'g-p-third', status: 'pending', created_at: '2026-01-03' },
      ];

      mockLimit.mockResolvedValue({ data: requests, error: null });

      const page = createMockPage();
      const mechanism = createMockMechanism(true);

      const result = await processor.processQueue(page as any, mechanism);

      expect(result.processed).toBe(3);
      expect(result.succeeded).toBe(3);
      expect(mechanism.touch).toHaveBeenCalledTimes(3);
    });

    it('handles database fetch errors gracefully', async () => {
      mockLimit.mockResolvedValue({
        data: null,
        error: { code: 'ERROR', message: 'Connection failed' },
      });

      const page = createMockPage();
      const mechanism = createMockMechanism();

      const result = await processor.processQueue(page as any, mechanism);

      expect(result.processed).toBe(0);
      expect(mechanism.touch).not.toHaveBeenCalled();
    });

    it('prevents concurrent processing', async () => {
      // Simulate a slow touch operation
      const slowMechanism: TouchMechanism = {
        name: 'slow',
        touch: vi.fn().mockImplementation(async () => {
          await new Promise(resolve => setTimeout(resolve, 100));
          return { projectId: 'test', success: true };
        }),
      };

      const pendingRequest = {
        id: 1,
        project_id: 'g-p-test',
        status: 'pending',
        created_at: new Date().toISOString(),
      };

      mockLimit.mockResolvedValue({ data: [pendingRequest], error: null });

      const page = createMockPage();

      // Start first processing
      const firstProcess = processor.processQueue(page as any, slowMechanism);

      // Immediately try second processing
      const secondResult = await processor.processQueue(page as any, slowMechanism);

      // Second should return immediately with empty result
      expect(secondResult.processed).toBe(0);

      // Wait for first to complete
      const firstResult = await firstProcess;
      expect(firstResult.processed).toBe(1);
    });
  });

  describe('polling', () => {
    it('starts and stops polling', () => {
      const page = createMockPage();
      const mechanism = createMockMechanism();

      expect(processor.isPolling()).toBe(false);

      processor.startPolling(page as any, mechanism);
      expect(processor.isPolling()).toBe(true);

      processor.stopPolling();
      expect(processor.isPolling()).toBe(false);
    });

    it('does not start polling twice', () => {
      const page = createMockPage();
      const mechanism = createMockMechanism();

      processor.startPolling(page as any, mechanism);
      processor.startPolling(page as any, mechanism); // Should warn but not error

      expect(processor.isPolling()).toBe(true);

      processor.stopPolling();
    });

    it('calls onResult callback when requests are processed', async () => {
      const pendingRequest = {
        id: 1,
        project_id: 'g-p-test',
        status: 'pending',
        created_at: new Date().toISOString(),
      };

      mockLimit.mockResolvedValue({ data: [pendingRequest], error: null });

      const page = createMockPage();
      const mechanism = createMockMechanism();
      const onResult = vi.fn();

      processor.startPolling(page as any, mechanism, onResult);

      // Wait for initial poll
      await new Promise(resolve => setTimeout(resolve, 50));

      expect(onResult).toHaveBeenCalledWith(
        expect.objectContaining({
          processed: 1,
          succeeded: 1,
        })
      );

      processor.stopPolling();
    });
  });

  describe('createTouchQueueProcessor', () => {
    it('creates a new processor instance', () => {
      const processor = createTouchQueueProcessor();
      expect(processor).toBeInstanceOf(TouchQueueProcessor);
    });
  });
});

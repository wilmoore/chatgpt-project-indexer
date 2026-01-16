import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { Page } from 'playwright';
import { CONFIG } from '../config/constants.js';
import type { TouchMechanism, TouchResult } from './types.js';
import { logger as log } from '../utils/logger.js';

/**
 * Touch queue request from database
 */
interface TouchQueueRequest {
  id: number;
  project_id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  error_message: string | null;
  created_at: string;
  processed_at: string | null;
}

/**
 * Result of processing the touch queue
 */
export interface QueueProcessResult {
  processed: number;
  succeeded: number;
  failed: number;
  errors: Array<{ requestId: number; projectId: string; error: string }>;
}

/**
 * Processes touch requests from the queue table.
 *
 * The queue allows external clients (like Raycast) to request touch
 * operations via the REST API. This processor polls for pending
 * requests and executes them using the browser session.
 */
export class TouchQueueProcessor {
  private client: SupabaseClient;
  private pollTimer: NodeJS.Timeout | null = null;
  private isProcessing = false;

  constructor() {
    this.client = createClient(
      CONFIG.SUPABASE.URL,
      CONFIG.SUPABASE.ANON_KEY
    );
  }

  /**
   * Polls the queue once and processes pending requests.
   *
   * @param page Playwright page with active ChatGPT session
   * @param mechanism Touch mechanism to use
   * @returns Processing result
   */
  async processQueue(
    page: Page,
    mechanism: TouchMechanism
  ): Promise<QueueProcessResult> {
    const result: QueueProcessResult = {
      processed: 0,
      succeeded: 0,
      failed: 0,
      errors: [],
    };

    // Prevent concurrent processing
    if (this.isProcessing) {
      log.debug('Touch queue: Already processing, skipping');
      return result;
    }

    this.isProcessing = true;

    try {
      // Fetch pending requests
      const { data: requests, error: fetchError } = await this.client
        .from(CONFIG.SUPABASE.TOUCH_QUEUE_TABLE)
        .select('*')
        .eq('status', 'pending')
        .order('created_at', { ascending: true })
        .limit(CONFIG.TOUCH_QUEUE.BATCH_SIZE);

      if (fetchError) {
        log.error(`Touch queue: Failed to fetch requests: ${fetchError.message}`);
        return result;
      }

      if (!requests || requests.length === 0) {
        return result;
      }

      log.info(`Touch queue: Processing ${requests.length} pending request(s)`);

      // Process each request
      for (const request of requests as TouchQueueRequest[]) {
        result.processed++;

        // Mark as processing
        await this.updateRequestStatus(request.id, 'processing');

        try {
          // Create a minimal project record for the touch mechanism
          const touchResult = await mechanism.touch(page, {
            id: request.project_id,
            title: `Project ${request.project_id}`, // Title not needed for touch
            firstSeenAt: new Date().toISOString(),
            lastConfirmedAt: new Date().toISOString(),
          });

          if (touchResult.success) {
            await this.updateRequestStatus(request.id, 'completed');
            result.succeeded++;
            log.info(`Touch queue: Successfully touched ${request.project_id}`);
          } else {
            await this.updateRequestStatus(request.id, 'failed', touchResult.error);
            result.failed++;
            result.errors.push({
              requestId: request.id,
              projectId: request.project_id,
              error: touchResult.error ?? 'Unknown error',
            });
            log.error(`Touch queue: Failed to touch ${request.project_id}: ${touchResult.error}`);
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          await this.updateRequestStatus(request.id, 'failed', errorMessage);
          result.failed++;
          result.errors.push({
            requestId: request.id,
            projectId: request.project_id,
            error: errorMessage,
          });
          log.error(`Touch queue: Error touching ${request.project_id}: ${errorMessage}`);
        }

        // Small delay between touches to avoid rate limiting
        if (result.processed < requests.length) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }

      // Cleanup old completed/failed requests
      await this.cleanupOldRequests();

    } finally {
      this.isProcessing = false;
    }

    return result;
  }

  /**
   * Updates a request's status in the database
   */
  private async updateRequestStatus(
    requestId: number,
    status: 'processing' | 'completed' | 'failed',
    errorMessage?: string
  ): Promise<void> {
    const update: Record<string, unknown> = { status };

    if (status === 'completed' || status === 'failed') {
      update.processed_at = new Date().toISOString();
    }

    if (errorMessage) {
      update.error_message = errorMessage;
    }

    const { error } = await this.client
      .from(CONFIG.SUPABASE.TOUCH_QUEUE_TABLE)
      .update(update)
      .eq('id', requestId);

    if (error) {
      log.error(`Touch queue: Failed to update request ${requestId}: ${error.message}`);
    }
  }

  /**
   * Cleans up old completed/failed requests
   */
  private async cleanupOldRequests(): Promise<void> {
    try {
      const { error } = await this.client.rpc('cleanup_old_touch_requests');
      if (error) {
        log.debug(`Touch queue: Cleanup function not available: ${error.message}`);
      }
    } catch {
      // Ignore cleanup errors - not critical
    }
  }

  /**
   * Starts continuous polling of the queue
   *
   * @param page Playwright page with active ChatGPT session
   * @param mechanism Touch mechanism to use
   * @param onResult Optional callback for processing results
   */
  startPolling(
    page: Page,
    mechanism: TouchMechanism,
    onResult?: (result: QueueProcessResult) => void
  ): void {
    if (this.pollTimer) {
      log.warn('Touch queue: Polling already started');
      return;
    }

    log.info(`Touch queue: Starting polling (interval: ${CONFIG.TOUCH_QUEUE.POLL_INTERVAL}ms)`);

    const poll = async () => {
      const result = await this.processQueue(page, mechanism);

      if (result.processed > 0 && onResult) {
        onResult(result);
      }
    };

    // Initial poll
    poll().catch(err => log.error(`Touch queue: Initial poll failed: ${err instanceof Error ? err.message : String(err)}`));

    // Set up interval
    this.pollTimer = setInterval(() => {
      poll().catch(err => log.error(`Touch queue: Poll failed: ${err instanceof Error ? err.message : String(err)}`));
    }, CONFIG.TOUCH_QUEUE.POLL_INTERVAL);
  }

  /**
   * Stops continuous polling
   */
  stopPolling(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
      log.info('Touch queue: Stopped polling');
    }
  }

  /**
   * Checks if polling is currently active
   */
  isPolling(): boolean {
    return this.pollTimer !== null;
  }
}

/**
 * Creates a new TouchQueueProcessor instance
 */
export function createTouchQueueProcessor(): TouchQueueProcessor {
  return new TouchQueueProcessor();
}

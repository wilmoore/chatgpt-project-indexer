import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NotificationRateLimiter } from './rate-limiter.js';

describe('NotificationRateLimiter', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  describe('canNotify', () => {
    it('should allow first notification for an event', () => {
      const limiter = new NotificationRateLimiter(60000); // 1 minute cooldown
      expect(limiter.canNotify('auth_failure')).toBe(true);
    });

    it('should block notification within cooldown period', () => {
      const limiter = new NotificationRateLimiter(60000);

      limiter.recordNotification('auth_failure');

      expect(limiter.canNotify('auth_failure')).toBe(false);
    });

    it('should allow notification after cooldown period', () => {
      const limiter = new NotificationRateLimiter(60000);

      limiter.recordNotification('auth_failure');

      // Advance time past cooldown
      vi.advanceTimersByTime(60001);

      expect(limiter.canNotify('auth_failure')).toBe(true);
    });

    it('should track events independently', () => {
      const limiter = new NotificationRateLimiter(60000);

      limiter.recordNotification('auth_failure');

      // Different event should not be affected
      expect(limiter.canNotify('scan_complete')).toBe(true);
      expect(limiter.canNotify('auth_failure')).toBe(false);
    });
  });

  describe('getTimeUntilNextNotification', () => {
    it('should return 0 for events never recorded', () => {
      const limiter = new NotificationRateLimiter(60000);
      expect(limiter.getTimeUntilNextNotification('auth_failure')).toBe(0);
    });

    it('should return remaining time during cooldown', () => {
      const limiter = new NotificationRateLimiter(60000);

      limiter.recordNotification('auth_failure');

      // Advance 30 seconds
      vi.advanceTimersByTime(30000);

      const remaining = limiter.getTimeUntilNextNotification('auth_failure');
      expect(remaining).toBeCloseTo(30000, -2); // Allow some tolerance
    });

    it('should return 0 after cooldown expires', () => {
      const limiter = new NotificationRateLimiter(60000);

      limiter.recordNotification('auth_failure');
      vi.advanceTimersByTime(60001);

      expect(limiter.getTimeUntilNextNotification('auth_failure')).toBe(0);
    });
  });

  describe('reset', () => {
    it('should clear all tracked events', () => {
      const limiter = new NotificationRateLimiter(60000);

      limiter.recordNotification('auth_failure');
      limiter.recordNotification('scan_complete');

      limiter.reset();

      expect(limiter.canNotify('auth_failure')).toBe(true);
      expect(limiter.canNotify('scan_complete')).toBe(true);
    });
  });

  describe('with zero cooldown', () => {
    it('should always allow notifications', () => {
      const limiter = new NotificationRateLimiter(0);

      limiter.recordNotification('auth_failure');

      expect(limiter.canNotify('auth_failure')).toBe(true);
    });
  });
});

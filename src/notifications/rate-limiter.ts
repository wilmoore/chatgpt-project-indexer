/**
 * Simple in-memory rate limiter to prevent notification spam.
 * Tracks last notification time per event type.
 */

export class NotificationRateLimiter {
  private lastNotificationTime: Map<string, number> = new Map();

  constructor(private cooldownMs: number) {}

  /**
   * Check if a notification can be sent for the given event.
   * Returns true if enough time has passed since the last notification.
   */
  canNotify(event: string): boolean {
    const lastTime = this.lastNotificationTime.get(event) ?? 0;
    const now = Date.now();
    return now - lastTime >= this.cooldownMs;
  }

  /**
   * Record that a notification was sent for the given event.
   * Call this after successfully sending a notification.
   */
  recordNotification(event: string): void {
    this.lastNotificationTime.set(event, Date.now());
  }

  /**
   * Get the time remaining until the next notification can be sent.
   * Returns 0 if a notification can be sent now.
   */
  getTimeUntilNextNotification(event: string): number {
    const lastTime = this.lastNotificationTime.get(event) ?? 0;
    const now = Date.now();
    const elapsed = now - lastTime;
    return Math.max(0, this.cooldownMs - elapsed);
  }

  /**
   * Reset the rate limiter state.
   * Useful for testing.
   */
  reset(): void {
    this.lastNotificationTime.clear();
  }
}

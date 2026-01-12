/**
 * Structured logger with ISO timestamps for journalctl/tail compatibility.
 * Single-line format for easy parsing and log aggregation.
 */

export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
};

/**
 * Global log level setting. Default is INFO (debug messages hidden).
 * Set to DEBUG to see verbose output.
 */
let currentLogLevel: LogLevel = 'INFO';

/**
 * Sets the global log level. Messages below this level will be suppressed.
 */
export function setLogLevel(level: LogLevel): void {
  currentLogLevel = level;
}

/**
 * Gets the current log level.
 */
export function getLogLevel(): LogLevel {
  return currentLogLevel;
}

/**
 * Checks if a given log level should be output based on current setting.
 */
function shouldLog(level: LogLevel): boolean {
  return LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[currentLogLevel];
}

export interface Logger {
  debug(message: string): void;
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}

/**
 * Formats a log message with ISO timestamp and level.
 * Format: 2026-01-04T10:00:00.000Z [INFO] message
 */
function formatMessage(level: LogLevel, message: string): string {
  const timestamp = new Date().toISOString();
  return `${timestamp} [${level}] ${message}`;
}

/**
 * Creates a structured logger that outputs to stdout/stderr.
 * - DEBUG, INFO, WARN -> stdout (DEBUG only if log level allows)
 * - ERROR -> stderr
 */
export function createLogger(): Logger {
  return {
    debug(message: string): void {
      if (shouldLog('DEBUG')) {
        console.log(formatMessage('DEBUG', message));
      }
    },
    info(message: string): void {
      if (shouldLog('INFO')) {
        console.log(formatMessage('INFO', message));
      }
    },
    warn(message: string): void {
      if (shouldLog('WARN')) {
        console.log(formatMessage('WARN', message));
      }
    },
    error(message: string): void {
      if (shouldLog('ERROR')) {
        console.error(formatMessage('ERROR', message));
      }
    },
  };
}

/**
 * Default logger instance for convenience.
 */
export const logger = createLogger();

/**
 * Parses an interval string (e.g., "15m", "1h", "30s") to milliseconds.
 * Supports: s (seconds), m (minutes), h (hours)
 * Falls back to treating as minutes if no unit specified.
 */
export function parseInterval(interval: string): number {
  const match = interval.match(/^(\d+)(s|m|h)?$/i);
  if (!match) {
    throw new Error(`Invalid interval format: ${interval}. Use format like "15m", "1h", or "30s"`);
  }

  const value = parseInt(match[1], 10);
  const unit = (match[2] || 'm').toLowerCase();

  switch (unit) {
    case 's':
      return value * 1000;
    case 'm':
      return value * 60 * 1000;
    case 'h':
      return value * 60 * 60 * 1000;
    default:
      return value * 60 * 1000;
  }
}

/**
 * Formats milliseconds as a human-readable interval (e.g., "15m", "1h 30m").
 */
export function formatInterval(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    const remainingMinutes = minutes % 60;
    return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
  }
  if (minutes > 0) {
    return `${minutes}m`;
  }
  return `${seconds}s`;
}

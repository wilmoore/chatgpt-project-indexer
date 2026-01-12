import { describe, it, expect } from 'vitest';
import { parseInterval, formatInterval } from '../../src/utils/logger.js';

describe('parseInterval', () => {
  describe('seconds', () => {
    it('parses "30s" to 30000ms', () => {
      expect(parseInterval('30s')).toBe(30_000);
    });

    it('parses "1s" to 1000ms', () => {
      expect(parseInterval('1s')).toBe(1_000);
    });

    it('handles uppercase "S"', () => {
      expect(parseInterval('30S')).toBe(30_000);
    });
  });

  describe('minutes', () => {
    it('parses "15m" to 900000ms', () => {
      expect(parseInterval('15m')).toBe(15 * 60 * 1_000);
    });

    it('parses "1m" to 60000ms', () => {
      expect(parseInterval('1m')).toBe(60_000);
    });

    it('handles uppercase "M"', () => {
      expect(parseInterval('15M')).toBe(15 * 60 * 1_000);
    });

    it('defaults to minutes when no unit specified', () => {
      expect(parseInterval('15')).toBe(15 * 60 * 1_000);
    });
  });

  describe('hours', () => {
    it('parses "1h" to 3600000ms', () => {
      expect(parseInterval('1h')).toBe(60 * 60 * 1_000);
    });

    it('parses "2h" to 7200000ms', () => {
      expect(parseInterval('2h')).toBe(2 * 60 * 60 * 1_000);
    });

    it('handles uppercase "H"', () => {
      expect(parseInterval('1H')).toBe(60 * 60 * 1_000);
    });
  });

  describe('invalid formats', () => {
    it('throws for empty string', () => {
      expect(() => parseInterval('')).toThrow('Invalid interval format');
    });

    it('throws for invalid unit', () => {
      expect(() => parseInterval('15d')).toThrow('Invalid interval format');
    });

    it('throws for non-numeric value', () => {
      expect(() => parseInterval('abc')).toThrow('Invalid interval format');
    });

    it('throws for negative values', () => {
      expect(() => parseInterval('-15m')).toThrow('Invalid interval format');
    });
  });
});

describe('formatInterval', () => {
  describe('seconds', () => {
    it('formats 1000ms as "1s"', () => {
      expect(formatInterval(1_000)).toBe('1s');
    });

    it('formats 30000ms as "30s"', () => {
      expect(formatInterval(30_000)).toBe('30s');
    });
  });

  describe('minutes', () => {
    it('formats 60000ms as "1m"', () => {
      expect(formatInterval(60_000)).toBe('1m');
    });

    it('formats 900000ms as "15m"', () => {
      expect(formatInterval(15 * 60 * 1_000)).toBe('15m');
    });
  });

  describe('hours', () => {
    it('formats 3600000ms as "1h"', () => {
      expect(formatInterval(60 * 60 * 1_000)).toBe('1h');
    });

    it('formats 5400000ms as "1h 30m"', () => {
      expect(formatInterval(90 * 60 * 1_000)).toBe('1h 30m');
    });

    it('formats 7200000ms as "2h"', () => {
      expect(formatInterval(2 * 60 * 60 * 1_000)).toBe('2h');
    });
  });

  describe('edge cases', () => {
    it('formats 0ms as "0s"', () => {
      expect(formatInterval(0)).toBe('0s');
    });

    it('formats 500ms as "0s"', () => {
      // Less than 1 second rounds down
      expect(formatInterval(500)).toBe('0s');
    });
  });
});

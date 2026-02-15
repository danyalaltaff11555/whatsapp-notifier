import { calculateRetryDelay, shouldRetry } from '../retry';

describe('Retry Utilities', () => {
  describe('calculateRetryDelay', () => {
    it('should calculate exponential backoff correctly', () => {
      expect(calculateRetryDelay(1)).toBe(1000); // 1 second
      expect(calculateRetryDelay(2)).toBe(2000); // 2 seconds
      expect(calculateRetryDelay(3)).toBe(4000); // 4 seconds
      expect(calculateRetryDelay(4)).toBe(8000); // 8 seconds
    });

    it('should cap at maximum delay', () => {
      expect(calculateRetryDelay(10)).toBeLessThanOrEqual(60000); // Max 60 seconds
    });

    it('should handle attempt number 0', () => {
      expect(calculateRetryDelay(0)).toBeGreaterThan(0);
    });
  });

  describe('shouldRetry', () => {
    it('should retry on retryable errors', () => {
      expect(shouldRetry(1, 5, true)).toBe(true);
      expect(shouldRetry(3, 5, true)).toBe(true);
    });

    it('should not retry when max attempts reached', () => {
      expect(shouldRetry(5, 5, true)).toBe(false);
      expect(shouldRetry(6, 5, true)).toBe(false);
    });

    it('should not retry on non-retryable errors', () => {
      expect(shouldRetry(1, 5, false)).toBe(false);
      expect(shouldRetry(3, 5, false)).toBe(false);
    });
  });
});

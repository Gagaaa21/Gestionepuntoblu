import { isNetworkError } from "./offline-queue";

export type RetryOptions = {
  attempts?: number;
  baseDelayMs?: number;
  onAttempt?: (attempt: number, total: number) => void;
};

/**
 * Retry a function on transient network errors with exponential backoff.
 * Default: 3 attempts, 2s / 4s / 8s pauses between attempts.
 * Non-network errors (e.g. wrong credentials) are thrown immediately.
 */
export async function retryOnNetworkError<T>(
  fn: () => Promise<T>,
  opts: RetryOptions = {}
): Promise<T> {
  const attempts = opts.attempts ?? 3;
  const base = opts.baseDelayMs ?? 2000;
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      opts.onAttempt?.(i + 1, attempts);
      return await fn();
    } catch (err) {
      lastErr = err;
      if (!isNetworkError(err) || i === attempts - 1) throw err;
      await new Promise((r) => setTimeout(r, base * Math.pow(2, i)));
    }
  }
  throw lastErr;
}

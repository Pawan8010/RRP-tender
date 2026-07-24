import { logger } from "./logger";

export interface RetryOptions {
  retries: number;
  baseDelayMs?: number;
  label?: string;
}

/**
 * Runs `fn`, retrying on failure with exponential backoff.
 * Used to make the scraper resilient to transient network/timeout errors.
 */
export async function withRetry<T>(fn: () => Promise<T>, opts: RetryOptions): Promise<T> {
  const { retries, baseDelayMs = 1000, label = "operation" } = opts;
  let lastError: unknown;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      const message = err instanceof Error ? err.message : String(err);
      logger.warn(`[retry] ${label} failed on attempt ${attempt}/${retries}: ${message}`);

      if (attempt < retries) {
        const delay = baseDelayMs * 2 ** (attempt - 1);
        await sleep(delay);
      }
    }
  }

  throw new Error(
    `[retry] ${label} failed after ${retries} attempts: ${
      lastError instanceof Error ? lastError.message : String(lastError)
    }`
  );
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Per-token rate limiting for the MCP endpoint.
 *
 * The endpoint writes a row to ichchi_events on every single tool call, so an
 * agent stuck in a retry loop does not just burn CPU — it grows the database
 * without bound on someone else's disk. A cap on active tokens (lib/tokens.ts)
 * bounded how many keys exist; nothing bounded how fast one could be used.
 *
 * The window is a fixed bucket rather than a true sliding log: a log would
 * keep one timestamp per request per token, which is the same unbounded growth
 * one layer up. A fixed bucket lets a caller send up to 2× the limit across a
 * boundary, and that is an acceptable price for O(1) memory per token.
 *
 * lazy: in-process counters, so the limit is per instance — correct for the
 * single-container deploy in docker-compose.yml, generous by a factor of N
 * behind N replicas. Move the bucket into Postgres (or Redis) when a second
 * instance actually exists; the interface here does not change.
 */

export interface RateLimitResult {
  ok: boolean;
  /** Calls left in the current window. */
  remaining: number;
  /** Seconds until the window resets — what a Retry-After header wants. */
  retryAfter: number;
}

interface Bucket {
  count: number;
  /** Epoch ms when this window ends. */
  resetAt: number;
}

/**
 * Calls per token per window. A busy session makes a handful: one brief at
 * the start, a feedback or a remember when something happens. Sixty a minute
 * is far above honest use and far below what hurts.
 */
export const RATE_LIMIT = 60;
export const WINDOW_MS = 60_000;

/**
 * Buckets live on globalThis for the same reason the pg Pool does: Next
 * reloads modules in dev, and a fresh Map per reload is a rate limiter that
 * silently stops limiting.
 */
const store = (globalThis as unknown as { _ichchiRate?: Map<string, Bucket> })._ichchiRate ??
  new Map<string, Bucket>();
(globalThis as unknown as { _ichchiRate?: Map<string, Bucket> })._ichchiRate = store;

/** Dropped once per sweep so an idle process does not hold every token seen. */
function sweep(now: number): void {
  for (const [key, bucket] of store) {
    if (bucket.resetAt <= now) store.delete(key);
  }
}

let lastSweep = 0;

export function checkRateLimit(
  key: string,
  limit = RATE_LIMIT,
  windowMs = WINDOW_MS,
  now = Date.now(),
): RateLimitResult {
  // Sweeping on a timer rather than on every call: the map is small, and an
  // O(n) pass per request is exactly the cost this is meant to prevent.
  if (now - lastSweep > windowMs) {
    lastSweep = now;
    sweep(now);
  }

  const bucket = store.get(key);
  if (!bucket || bucket.resetAt <= now) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, remaining: limit - 1, retryAfter: 0 };
  }

  bucket.count += 1;
  const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
  if (bucket.count > limit) {
    return { ok: false, remaining: 0, retryAfter };
  }
  return { ok: true, remaining: limit - bucket.count, retryAfter };
}

/** Tests need a clean slate; nothing in the app calls this. */
export function resetRateLimits(): void {
  store.clear();
  lastSweep = 0;
}

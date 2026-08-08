import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { checkRateLimit, resetRateLimits } from "./rate-limit";

/**
 * The limiter is the only thing standing between one runaway agent and an
 * unbounded ichi_events table, so its edges get asserted rather than
 * assumed: that it actually refuses past the limit, that the window really
 * reopens, and that two tokens never share a budget.
 */

beforeEach(() => resetRateLimits());

test("allows up to the limit, then refuses", () => {
  const now = 1_000_000;
  for (let i = 0; i < 3; i++) {
    const r = checkRateLimit("tok", 3, 60_000, now);
    assert.equal(r.ok, true, `call ${i + 1} should pass`);
  }

  const over = checkRateLimit("tok", 3, 60_000, now);
  assert.equal(over.ok, false);
  assert.equal(over.remaining, 0);
  assert.ok(over.retryAfter > 0, "a refusal must say when to come back");
});

test("the window reopens once it has elapsed", () => {
  const now = 1_000_000;
  checkRateLimit("tok", 1, 60_000, now);
  assert.equal(checkRateLimit("tok", 1, 60_000, now).ok, false);

  // One millisecond past the window: the bucket is a new one.
  const later = now + 60_001;
  assert.equal(checkRateLimit("tok", 1, 60_000, later).ok, true);
});

test("budgets are per token, not shared", () => {
  const now = 1_000_000;
  assert.equal(checkRateLimit("a", 1, 60_000, now).ok, true);
  assert.equal(checkRateLimit("a", 1, 60_000, now).ok, false);
  // b must be untouched by a exhausting its budget.
  assert.equal(checkRateLimit("b", 1, 60_000, now).ok, true);
});

test("remaining counts down and never goes negative", () => {
  const now = 1_000_000;
  assert.equal(checkRateLimit("tok", 2, 60_000, now).remaining, 1);
  assert.equal(checkRateLimit("tok", 2, 60_000, now).remaining, 0);
  assert.equal(checkRateLimit("tok", 2, 60_000, now).remaining, 0);
});

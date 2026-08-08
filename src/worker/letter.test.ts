import { test, before } from "node:test";
import assert from "node:assert/strict";
import type { weekStart as weekStartFn } from "./letter";

/**
 * letter.ts imports the database pool (env-validated), so the test sets a
 * placeholder DSN before touching it — same arrangement as reflect.test.ts.
 */
process.env.DATABASE_URL ??= "postgres://ichi:ichi@localhost:5433/ichi";

let weekStart: typeof weekStartFn;

before(async () => {
  weekStart = (await import("./letter")).weekStart;
});

/**
 * Week boundaries are the kind of logic that looks obviously right and is
 * wrong twice a year. Getting it wrong here means either a duplicate letter
 * or a silently skipped week, and both are invisible until someone counts.
 */
test("weekStart returns the Monday of the containing week", () => {
  // Monday 2026-08-03 through Sunday 2026-08-09 all belong to 2026-08-03.
  assert.equal(weekStart(new Date("2026-08-03T00:00:00Z")), "2026-08-03");
  assert.equal(weekStart(new Date("2026-08-06T13:45:00Z")), "2026-08-03");
  assert.equal(weekStart(new Date("2026-08-09T23:59:59Z")), "2026-08-03");

  // The next Monday starts a new week, not the same one.
  assert.equal(weekStart(new Date("2026-08-10T00:00:00Z")), "2026-08-10");
});

test("weekStart treats Sunday as the end of a week, not the start", () => {
  // The classic off-by-one: getUTCDay() calls Sunday 0, so a naive shift puts
  // Sunday at the start of the *following* week.
  assert.equal(weekStart(new Date("2026-08-02T12:00:00Z")), "2026-07-27");
});

test("weekStart crosses month and year boundaries", () => {
  // Wednesday 2026-01-01 sits in the week beginning Monday 2025-12-29.
  assert.equal(weekStart(new Date("2026-01-01T09:00:00Z")), "2025-12-29");
});

test("weekStart is stable across times of day", () => {
  const day = "2026-08-06";
  const early = weekStart(new Date(`${day}T00:00:00Z`));
  const late = weekStart(new Date(`${day}T23:59:59Z`));
  assert.equal(early, late);
});

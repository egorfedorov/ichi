import { test, before } from "node:test";
import assert from "node:assert/strict";
import type { memoryKind as memoryKindFn } from "./mcp";

/**
 * lib/mcp.ts imports the database pool (env-validated), so the test sets a
 * placeholder DSN before touching it — same arrangement as the worker tests.
 */
process.env.DATABASE_URL ??= "postgres://ichi:ichi@localhost:5433/ichi";

let memoryKind: typeof memoryKindFn;

before(async () => {
  memoryKind = (await import("./mcp")).memoryKind;
});

/**
 * The regression this file exists for.
 *
 * "standard" was added to the type, the migration, both tool schemas, the
 * decay floor and the voice block — and then silently downgraded to "event"
 * by a hand-written allowlist here. The flagship feature stored nothing that
 * could ever ride in a brief, and nothing failed: the write succeeded, just
 * as the wrong kind. Only an end-to-end check against a running server caught
 * it, which is far too late.
 */
test("every kind the mechanics know is accepted", () => {
  for (const kind of ["event", "insult", "praise", "belief", "fact", "standard"]) {
    assert.equal(memoryKind(kind), kind, `${kind} must survive validation`);
  }
});

test("unknown or malformed kinds fall back to event", () => {
  assert.equal(memoryKind("nonsense"), "event");
  assert.equal(memoryKind(""), "event");
  assert.equal(memoryKind(undefined), "event");
  assert.equal(memoryKind(null), "event");
  assert.equal(memoryKind(42), "event");
  assert.equal(memoryKind({ kind: "standard" }), "event");
});

/**
 * A prototype key must not be mistaken for a memory kind: `"toString" in obj`
 * is true for every object, and the validator uses `in`.
 */
test("prototype keys are not memory kinds", () => {
  assert.equal(memoryKind("toString"), "event");
  assert.equal(memoryKind("constructor"), "event");
  assert.equal(memoryKind("__proto__"), "event");
});

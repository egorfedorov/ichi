import { test } from "node:test";
import assert from "node:assert/strict";
import { recallScore, salienceDecay } from "./memory";

test("recallScore is monotone in salience, recency and rehearsal", () => {
  const base = { salience: 0.5, recencyHours: 24, recallCount: 0 };
  assert.ok(recallScore({ ...base, salience: 0.9 }) > recallScore(base));
  assert.ok(recallScore({ ...base, recencyHours: 1 }) > recallScore(base));
  assert.ok(recallScore({ ...base, recallCount: 5 }) > recallScore(base));

  // Salience dominates: weak-but-fresh loses to strong-but-old.
  const weakFresh = recallScore({ salience: 0.2, recencyHours: 0, recallCount: 0 });
  const strongOld = recallScore({ salience: 0.9, recencyHours: 24, recallCount: 0 });
  assert.ok(strongOld > weakFresh);
});

test("salienceDecay shrinks salience over time", () => {
  const start = 0.8;
  const week = salienceDecay(start, 0, 7);
  const month = salienceDecay(start, 0, 30);
  assert.ok(week < start);
  assert.ok(month < week);
  // Zero days is a no-op.
  assert.equal(salienceDecay(start, 0, 0), start);
});

test("charged memories fade slower than neutral ones", () => {
  const neutral = salienceDecay(0.8, 0, 14);
  const painful = salienceDecay(0.8, -0.9, 14);
  assert.ok(painful > neutral);
});

test("salienceDecay stays inside 0..1", () => {
  assert.ok(salienceDecay(0.8, 0, 3650) >= 0);
  assert.ok(salienceDecay(1, 1, 0) <= 1);
});

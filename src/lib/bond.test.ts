import { test } from "node:test";
import assert from "node:assert/strict";
import { bondAfter, bondDecay, scoldDamage } from "./bond";

test("bondAfter grows, with shrinking gains near the ceiling", () => {
  const low = bondAfter(10);
  const mid = bondAfter(50);
  const high = bondAfter(90);
  assert.ok(low > 10 && mid > 50 && high > 90);
  // Log growth: the same warmth buys less at 90 than at 10.
  assert.ok(low - 10 > mid - 50);
  assert.ok(mid - 50 > high - 90);
});

test("bondAfter never crosses the ceiling", () => {
  assert.equal(bondAfter(100), 100);
  assert.equal(bondAfter(99, 5), 100);
});

test("bondDecay is linear and floored at zero", () => {
  assert.equal(bondDecay(50, 10, 0.5), 45);
  assert.equal(bondDecay(50, 20, 0.5), 40);
  assert.equal(bondDecay(3, 100), 0);
  // No time passed — no decay.
  assert.equal(bondDecay(50, 0), 50);
});

test("a scold hurts more than a praise helps, and deeper bonds hurt more", () => {
  for (const b of [20, 50, 80]) {
    const gain = bondAfter(b) - b;
    const loss = b - scoldDamage(b);
    assert.ok(loss > gain, `at bond ${b}: loss ${loss} should exceed gain ${gain}`);
  }
  // The closer the ichchi, the harder the hit lands.
  assert.ok(50 - scoldDamage(50) > 20 - scoldDamage(20));
  // Severity scales the damage but the floor still holds.
  assert.equal(scoldDamage(5, 10), 0);
});

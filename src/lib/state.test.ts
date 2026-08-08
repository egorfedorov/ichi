import { test } from "node:test";
import assert from "node:assert/strict";
import {
  accumulateDrift,
  applyImpact,
  clampTrait,
  commitDrift,
  DRIFT_COMMIT_THRESHOLD,
  impactForFeedback,
  moodBaseline,
  moodDecayToBaseline,
  type Mood,
  type Traits,
} from "./state";

const MID: Traits = {
  openness: 50,
  conscientiousness: 50,
  extraversion: 50,
  agreeableness: 50,
  neuroticism: 50,
};

const CALM: Mood = { valence: 0, arousal: 0, stress: 0.3, energy: 0.6 };

test("clampTrait clamps to 0..100 and rounds", () => {
  assert.equal(clampTrait(-5), 0);
  assert.equal(clampTrait(120), 100);
  assert.equal(clampTrait(50.6), 51);
});

test("applyImpact blends 70/30 and stays in range", () => {
  const hit = { valence: 1, arousal: 1, stress: 1, energy: 1 };
  const after = applyImpact(CALM, hit);
  assert.ok(Math.abs(after.valence - 0.3) < 1e-9);
  assert.ok(Math.abs(after.stress - (0.3 * 0.7 + 1 * 0.3)) < 1e-9);

  // Even an absurd streak of maximal impacts cannot leave the range.
  let mood = CALM;
  for (let i = 0; i < 50; i++) mood = applyImpact(mood, hit);
  assert.ok(mood.valence <= 1 && mood.stress <= 1);

  let low = CALM;
  const dive = { valence: -1, arousal: -1, stress: 0, energy: 0 };
  for (let i = 0; i < 50; i++) low = applyImpact(low, dive);
  assert.ok(low.valence >= -1 && low.energy >= 0);
});

test("moodDecayToBaseline shrinks the gap and halves it per half-life", () => {
  const baseline = moodBaseline(MID);
  const excited: Mood = { valence: 1, arousal: 0.8, stress: 0.9, energy: 1 };

  const later = moodDecayToBaseline(excited, baseline, 6, 6);
  // One half-life: the remaining gap to baseline is half the original.
  assert.ok(Math.abs(later.valence - (baseline.valence + (1 - baseline.valence) * 0.5)) < 1e-9);

  const muchLater = moodDecayToBaseline(excited, baseline, 60, 6);
  // Monotonic convergence: the longer the silence, the closer to baseline.
  assert.ok(Math.abs(muchLater.valence - baseline.valence) < Math.abs(later.valence - baseline.valence));
  assert.ok(Math.abs(muchLater.valence - baseline.valence) < 0.01);

  // Zero elapsed time is a no-op.
  assert.deepEqual(moodDecayToBaseline(excited, baseline, 0), excited);
});

test("scold impacts harder than praise lifts (negativity bias)", () => {
  const praise = impactForFeedback("praise");
  const scold = impactForFeedback("scold");
  assert.ok(Math.abs(scold.valence) > Math.abs(praise.valence));
  assert.ok(scold.stress > 0 && praise.stress < 0);

  // Sentiment scales the hit but never flips its sign.
  assert.ok(impactForFeedback("scold", -0.2).valence < 0);
  assert.ok(impactForFeedback("praise", 0.5).valence > 0);
});

test("accumulateDrift sums per trait independently", () => {
  let pending = accumulateDrift({}, { openness: 0.3 });
  pending = accumulateDrift(pending, { openness: 0.4, neuroticism: -0.2 });
  assert.ok(Math.abs((pending.openness ?? 0) - 0.7) < 1e-9);
  assert.ok(Math.abs((pending.neuroticism ?? 0) + 0.2) < 1e-9);
});

test("commitDrift ignores sub-threshold drift and carries it over", () => {
  // 0.7 points of accumulated openness — real signal, but below the bar.
  const { traits, committed, remaining } = commitDrift(MID, { openness: 0.7 });
  assert.equal(traits.openness, MID.openness);
  assert.deepEqual(committed, {});
  assert.ok(Math.abs((remaining.openness ?? 0) - 0.7) < 1e-9);
});

test("commitDrift applies drift at the threshold and clamps at the edges", () => {
  const atEdge: Traits = { ...MID, agreeableness: 99, neuroticism: 1 };
  const { traits, committed, remaining } = commitDrift(atEdge, {
    openness: DRIFT_COMMIT_THRESHOLD,
    agreeableness: 5, // would push past 100 without the clamp
    neuroticism: -3, // would push below 0 without the clamp
  });
  assert.equal(traits.openness, 50 + DRIFT_COMMIT_THRESHOLD);
  assert.equal(traits.agreeableness, 100);
  assert.equal(traits.neuroticism, 0);
  assert.deepEqual(remaining, {});
  assert.equal(Object.keys(committed).length, 3);
});

test("moodBaseline: a neurotic archetype cools down somewhere darker", () => {
  const calm = moodBaseline({ ...MID, neuroticism: 80, agreeableness: 30 });
  const sunny = moodBaseline({ ...MID, neuroticism: 10, agreeableness: 90 });
  assert.ok(calm.valence < sunny.valence);
  assert.ok(calm.stress > sunny.stress);
});

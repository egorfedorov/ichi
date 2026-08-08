import type { TraitName } from "@/db/types";

/**
 * Core state mechanics — pure functions, no database. The request path and
 * the worker both call these; keeping them pure is what makes the mechanics
 * testable and the worker a thin shell over SQL.
 *
 * Three time layers:
 *   1. reaction — the instantaneous impact of one event (impactForFeedback)
 *   2. mood     — exponential moving average of impacts, decaying back to a
 *                 trait-derived baseline over hours
 *   3. traits   — Big Five, mutated only by committed drift past a threshold
 */

export interface Traits {
  openness: number;
  conscientiousness: number;
  extraversion: number;
  agreeableness: number;
  neuroticism: number;
}

/** Current mood. valence/arousal run -1..1, stress/energy 0..1. */
export interface Mood {
  valence: number;
  arousal: number;
  stress: number;
  energy: number;
}

/** What one event did to the moment, before it is blended into mood. */
export interface Impact {
  valence: number;
  arousal: number;
  stress: number;
  energy: number;
}

export const TRAIT_MIN = 0;
export const TRAIT_MAX = 100;

export function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

export function clampTrait(v: number): number {
  return clamp(Math.round(v), TRAIT_MIN, TRAIT_MAX);
}

/**
 * The mood an ichchi returns to when nothing happens. Derived from traits so
 * that a choleric archetype and a phlegmatic one cool down to different
 * places: extraversion and agreeableness warm the baseline, neuroticism
 * sours it and keeps it tense.
 */
export function moodBaseline(traits: Traits): Mood {
  return {
    valence: clamp(
      (traits.extraversion + traits.agreeableness - traits.neuroticism - 50) / 150,
      -1,
      1,
    ),
    arousal: clamp((traits.extraversion - traits.conscientiousness) / 200, -1, 1),
    stress: clamp(traits.neuroticism / 200, 0, 1),
    energy: clamp(0.4 + traits.extraversion / 250, 0, 1),
  };
}

/**
 * Blend one event into the mood. 0.7/0.3: a single event moves the mood
 * visibly but never owns it — mood is an average of the recent past, not a
 * screenshot of the last thing that happened.
 */
export function applyImpact(mood: Mood, impact: Impact, weight = 0.3): Mood {
  const blend = (a: number, b: number) => a * (1 - weight) + b * weight;
  return {
    valence: clamp(blend(mood.valence, impact.valence), -1, 1),
    arousal: clamp(blend(mood.arousal, impact.arousal), -1, 1),
    stress: clamp(blend(mood.stress, impact.stress), 0, 1),
    energy: clamp(blend(mood.energy, impact.energy), 0, 1),
  };
}

/**
 * Exponential return to baseline. After `halfLifeHours` without events the
 * gap to the baseline halves; nothing ever snaps back instantly, which is
 * what keeps yesterday's quarrel faintly present this morning.
 */
export function moodDecayToBaseline(
  mood: Mood,
  baseline: Mood,
  elapsedHours: number,
  halfLifeHours = 6,
): Mood {
  if (elapsedHours <= 0) return mood;
  const k = Math.pow(0.5, elapsedHours / halfLifeHours);
  const decay = (a: number, b: number) => b + (a - b) * k;
  return {
    valence: clamp(decay(mood.valence, baseline.valence), -1, 1),
    arousal: clamp(decay(mood.arousal, baseline.arousal), -1, 1),
    stress: clamp(decay(mood.stress, baseline.stress), 0, 1),
    energy: clamp(decay(mood.energy, baseline.energy), 0, 1),
  };
}

/**
 * How one explicit feedback event hits the moment.
 *
 * Negativity bias is deliberate: a scolding lands harder than a praise lifts
 * (|valence| 0.8 vs 0.6), because that is how attachment actually works and
 * because it makes abuse costly rather than a neutral way to steer the ichchi.
 * `sentiment` (-1..1) scales the impact — a scold with a reason the ichchi
 * "agrees" with stings differently from a baseless one; the caller decides,
 * the formula just scales.
 */
export function impactForFeedback(
  kind: "praise" | "scold",
  sentiment = kind === "praise" ? 1 : -1,
): Impact {
  const s = clamp(sentiment, -1, 1);
  if (kind === "praise") {
    return {
      valence: 0.6 * Math.abs(s),
      arousal: 0.3,
      stress: -0.3,
      energy: 0.2,
    };
  }
  return {
    valence: -0.8 * Math.abs(s),
    arousal: 0.5,
    stress: 0.7,
    energy: -0.3,
  };
}

/** Accumulated, uncommitted personality mutation, keyed by trait. */
export type PendingDrift = Partial<Record<TraitName, number>>;

/**
 * Add an event's nudge to the pending pool. Individual events are tiny
 * (±0.1–0.5 points); they only become real when reflection commits them.
 */
export function accumulateDrift(pending: PendingDrift, delta: PendingDrift): PendingDrift {
  const out: PendingDrift = { ...pending };
  for (const [trait, v] of Object.entries(delta) as [TraitName, number][]) {
    out[trait] = (out[trait] ?? 0) + v;
  }
  return out;
}

/**
 * A trait must accumulate at least this many pending points before
 * reflection may commit it. The threshold is the anti-griefing guard: below
 * it, a burst of one-sided sessions just decays away uncommitted.
 */
export const DRIFT_COMMIT_THRESHOLD = 2;

export interface CommitResult {
  traits: Traits;
  /** What was actually applied, per trait — for the reflect event's delta. */
  committed: PendingDrift;
  /** Sub-threshold remainder, carried into the next round. */
  remaining: PendingDrift;
}

/**
 * Commit pending drift into traits. Per-trait threshold: only a trait whose
 * accumulated |drift| reaches the threshold is applied; the rest carries
 * over. Clamped to 0..100 — an ichchi can saturate a trait but never leave it.
 */
export function commitDrift(
  traits: Traits,
  pending: PendingDrift,
  threshold = DRIFT_COMMIT_THRESHOLD,
): CommitResult {
  const next = { ...traits };
  const committed: PendingDrift = {};
  const remaining: PendingDrift = {};

  for (const [trait, v] of Object.entries(pending) as [TraitName, number][]) {
    if (Math.abs(v) >= threshold) {
      next[trait] = clampTrait(next[trait] + v);
      committed[trait] = v;
    } else if (v !== 0) {
      remaining[trait] = v;
    }
  }

  return { traits: next, committed, remaining };
}

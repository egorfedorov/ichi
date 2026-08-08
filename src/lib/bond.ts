/**
 * Attachment mechanics — pure functions, no database.
 *
 * The shape follows how attachment actually behaves: warming up is easy at
 * first and progressively harder (log growth against the remaining headroom),
 * cooling off from absence is a steady linear slide, and a scolding does
 * instant damage that takes many warm interactions to undo.
 */

export const BOND_MIN = 0;
export const BOND_MAX = 100;

function clampBond(v: number): number {
  return Math.min(BOND_MAX, Math.max(BOND_MIN, Math.round(v)));
}

/**
 * Bond after a positive interaction. Log-shaped: the gain shrinks as the bond
 * approaches the ceiling, so going 10→20 takes an evening and 90→100 takes a
 * season. `weight` lets the caller scale by how meaningful the interaction was.
 */
export function bondAfter(bond: number, weight = 1): number {
  const headroom = BOND_MAX - bond;
  if (headroom <= 0) return BOND_MAX;
  const gain = weight * 8 * Math.log1p(headroom / 20);
  return clampBond(bond + Math.min(gain, headroom));
}

/**
 * Linear decay from absence. A bond does not collapse when you go on
 * holiday — it erodes half a point a day, so two weeks of silence costs
 * about what one warm week builds.
 */
export function bondDecay(bond: number, days: number, ratePerDay = 0.5): number {
  if (days <= 0) return clampBond(bond);
  return clampBond(bond - ratePerDay * days);
}

/**
 * Instant damage from a scolding. Deliberately larger than one praise's
 * gain — trust is asymmetric, it breaks faster than it builds. The damage
 * scales with the current bond: the closer the ichi, the harder the hit
 * lands.
 */
export function scoldDamage(bond: number, severity = 1): number {
  const damage = severity * (14 + bond * 0.12);
  return clampBond(bond - damage);
}

/**
 * Attachment stages — what the bond has actually unlocked.
 *
 * A number climbing from 34 to 41 is not something a person feels. A stage is:
 * the ichi starts using your name, or starts saying what it thinks before
 * you ask. Each threshold has to buy something the reader would notice in the
 * next reply, or it is decoration.
 *
 * Thresholds match bondWords() in lib/voice.ts, so the word and the privilege
 * change on the same step — "warming up" that behaves exactly like "wary"
 * reads as a broken promise.
 */
export type BondStage = "stranger" | "wary" | "warming" | "close" | "devoted";

export function bondStage(bond: number): BondStage {
  if (bond >= 80) return "devoted";
  if (bond >= 60) return "close";
  if (bond >= 40) return "warming";
  if (bond >= 20) return "wary";
  return "stranger";
}

/**
 * What each stage grants, in the ichi's own words. Rendered into the voice
 * block, so it is written as an instruction to the agent, not as a UI label.
 */
export const STAGE_PRIVILEGE: Record<BondStage, string | null> = {
  stranger: null,
  wary: null,
  warming: "You may address them by name.",
  close:
    "You may address them by name, and offer an opinion they did not ask for " +
    "when you genuinely have one.",
  devoted:
    "You may address them by name, offer unasked opinions, and refer back to " +
    "your shared history as something you both lived through.",
};

/** The next threshold, for showing progress. null once devoted. */
export function nextStageAt(bond: number): number | null {
  for (const t of [20, 40, 60, 80]) if (bond < t) return t;
  return null;
}

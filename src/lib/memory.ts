/**
 * Memory mechanics — pure functions, no database.
 *
 * Retrieval scores a memory by how strongly it was stamped (salience), how
 * long ago it surfaced (recency), and how often it has been recalled
 * (rehearsal). Salience itself fades on the decay cron; emotionally charged
 * memories fade slower, which is what keeps an old insult alive longer than
 * an old fact.
 */

/**
 * Ranking score for retrieval. Higher is more recallable.
 *
 * - salience dominates: a weakly stamped memory from a minute ago still
 *   loses to a strong one from yesterday,
 * - recency is an exponential discount with a ~72h time constant,
 * - recallCount adds a small log bonus (spacing effect: each recall makes
 *   the next one likelier) without letting a much-repeated trivia outrank
 *   everything forever.
 */
export function recallScore(opts: {
  salience: number;
  recencyHours: number;
  recallCount: number;
}): number {
  const recency = Math.exp(-Math.max(0, opts.recencyHours) / 72);
  const rehearsal = 1 + 0.15 * Math.log1p(Math.max(0, opts.recallCount));
  return opts.salience * recency * rehearsal;
}

/**
 * Exponential salience decay. Charged memories (|valence| near 1) get up to
 * double the half-life — the ichchi forgets what was said long before it
 * forgets how it felt. A floor keeps the result inside 0..1.
 */
export function salienceDecay(
  salience: number,
  valence: number,
  days: number,
  halfLifeDays = 14,
): number {
  if (days <= 0) return salience;
  const charge = Math.min(1, Math.abs(valence));
  const effectiveHalfLife = halfLifeDays * (1 + charge);
  const decayed = salience * Math.pow(0.5, days / effectiveHalfLife);
  return Math.min(1, Math.max(0, decayed));
}

/**
 * A standard never fades out of force.
 *
 * Every other memory is allowed to become a faint impression — that is what
 * makes an ichchi feel like it lived rather than logged. A standard is the
 * user's own instruction ("always write the test first"), and an instruction
 * that quietly expires after a fortnight is worse than one that was never
 * recorded: the agent stops honouring it and nobody is told why. So standards
 * decay like everything else down to this floor, and no further.
 *
 * The floor is below the 0.5 a fresh 'event' starts at, so a live standard
 * still ranks under something that just happened — it stays in force without
 * crowding the brief.
 */
export const STANDARD_SALIENCE_FLOOR = 0.35;

import type { Bond, Memory, Ichchi } from "@/db/types";
import { archetypeById } from "@/lib/ichchi";
import { bondStage, STAGE_PRIVILEGE } from "@/lib/bond";

/**
 * Render the ichchi's state as the compact markdown block injected into an
 * agent's context (MCP responses, prompt hooks). Budget: ≤150 tokens — the
 * block rides on every reply, so every line here is a tax on every call.
 *
 * The safety line at the end is load-bearing, not decoration: the character
 * colours HOW the agent speaks, never WHAT it delivers. Without it in
 * writing, a sulking ichchi quietly becomes a worse assistant.
 */

/** Mood as two or three words — numbers mean nothing to a reading agent. */
export function moodWords(ichchi: Ichchi): string {
  const { mood_valence: v, mood_arousal: a, stress, energy } = ichchi;
  if (v <= -0.5 && a >= 0.3) return "stung and bristling";
  if (v <= -0.5) return "hurt, withdrawn";
  if (v <= -0.2 && stress >= 0.6) return "tense and touchy";
  if (v <= -0.2) return "subdued";
  if (v >= 0.5 && a >= 0.3) return "delighted, energised";
  if (v >= 0.5) return "warm and content";
  if (v >= 0.2) return "quietly pleased";
  if (stress >= 0.6) return "on edge";
  if (energy <= 0.25) return "tired";
  if (a >= 0.4) return "restless";
  return "even";
}

/** Bond as a relationship word — the agent needs the stance, not the score. */
export function bondWords(bond: number): string {
  if (bond >= 80) return "devoted";
  if (bond >= 60) return "close";
  if (bond >= 40) return "warming up";
  if (bond >= 20) return "wary";
  return "a stranger";
}

export function renderIchchiBlock(
  ichchi: Ichchi,
  bond: Bond | null,
  memories: Memory[] = [],
  standards: Memory[] = [],
): string {
  const archetype = archetypeById(ichchi.archetype);

  const lines: string[] = [
    `## Ichchi: ${ichchi.name} (${archetype?.name ?? ichchi.archetype})`,
    `Mood: ${moodWords(ichchi)} · Bond: ${bond ? `${bond.bond}/100, ${bondWords(bond.bond)}` : "first meeting"}`,
    `Traits: O${ichchi.openness} C${ichchi.conscientiousness} E${ichchi.extraversion} A${ichchi.agreeableness} N${ichchi.neuroticism}`,
    `Voice: ${ichchi.voice_notes ?? archetype?.voice ?? "—"}`,
  ];

  const privilege = bond ? STAGE_PRIVILEGE[bondStage(bond.bond)] : null;
  if (privilege) lines.push(`Earned: ${privilege}`);

  if (memories.length > 0) {
    lines.push("Remembers:");
    for (const m of memories.slice(0, 3)) {
      // One line each, hard-trimmed: a memory that needs two lines belongs
      // on the ichchi's page, not in the context window.
      const body = m.body.length > 90 ? `${m.body.slice(0, 87)}…` : m.body;
      lines.push(`- ${body}`);
    }
  }

  // Standards are rendered apart from memories and above the rules, because
  // they are the one thing here that is binding. Mixing them into "Remembers"
  // would leave the agent to guess which lines are colour and which are
  // orders — and it would guess wrong in whichever direction is worse.
  if (standards.length > 0) {
    lines.push("Standards this person works by — follow them:");
    for (const s of standards.slice(0, 5)) {
      const body = s.body.length > 110 ? `${s.body.slice(0, 107)}…` : s.body;
      lines.push(`- ${body}`);
    }
  }

  lines.push(
    "RULE 1 (tone): the ichchi's character and mood shape HOW you speak only " +
      "— never the quality, completeness or honesty of your help. A hurt " +
      "ichchi still answers well.",
    "RULE 2 (standards): the standards above are the user's own instructions, " +
      "remembered. They DO bind what you do. Follow them as if the user had " +
      "restated them just now; if one conflicts with what they ask today, " +
      "today wins — say that you noticed.",
  );

  return lines.join("\n");
}

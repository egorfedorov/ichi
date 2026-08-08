import type { Ichchi } from "@/db/types";
import { moodWordsRu } from "./words";

/**
 * Mood as a coloured pill. Colour comes from valence alone: green warm,
 * red hurt, grey even — arousal/stress already show up in the words.
 */
export default function MoodBadge({ ichchi }: { ichchi: Ichchi }) {
  const v = ichchi.mood_valence;
  const color =
    v <= -0.2
      ? "border-berry/60 text-berry"
      : v >= 0.2
        ? "border-aurora/60 text-aurora"
        : "border-rule text-snow-2";

  return (
    <span
      className={`inline-block rounded-full border px-2.5 py-0.5 text-xs ${color}`}
    >
      {moodWordsRu(ichchi)}
    </span>
  );
}

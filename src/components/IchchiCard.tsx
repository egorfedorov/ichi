import Link from "next/link";
import type { Ichchi } from "@/db/types";
import { archetypeById } from "@/lib/ichchi";
import { bondWordsRu } from "./words";
import MoodBadge from "./MoodBadge";

/**
 * One ichchi in the /ichchi list. Bond and memory count come from the page's
 * joined query — the card stays a pure render, no per-row fetches.
 */
export default function IchchiCard({
  ichchi,
  bond,
  memoryCount,
}: {
  ichchi: Ichchi;
  bond: number | null;
  memoryCount: number;
}) {
  const archetype = archetypeById(ichchi.archetype);

  return (
    <Link
      href={`/ichchi/${ichchi.slug}`}
      className="block rounded-lg border border-rule bg-night-2 p-4 transition-colors hover:border-aurora"
    >
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-lg font-semibold text-snow">{ichchi.name}</h3>
        <MoodBadge ichchi={ichchi} />
      </div>
      <p className="mt-1 text-sm text-snow-2">
        {archetype?.name ?? ichchi.archetype}
        {archetype ? ` — ${archetype.tagline}` : ""}
      </p>
      <p className="mt-3 text-xs text-snow-3">
        связь: {bond === null ? "ещё нет" : `${bond}/100, ${bondWordsRu(bond)}`}
        {" · "}
        воспоминаний: {memoryCount}
      </p>
    </Link>
  );
}

import Link from "next/link";
import type { Ichi } from "@/db/types";
import { archetypeById } from "@/lib/ichi";
import { bondWords } from "@/lib/voice";
import MoodBadge from "./MoodBadge";

/**
 * One ichi in the /ichi list. Bond and memory count come from the page's
 * joined query — the card stays a pure render, no per-row fetches.
 */
export default function IchiCard({
  ichi,
  bond,
  memoryCount,
}: {
  ichi: Ichi;
  bond: number | null;
  memoryCount: number;
}) {
  const archetype = archetypeById(ichi.archetype);

  return (
    <Link
      href={`/ichi/${ichi.slug}`}
      className="block rounded-lg border border-rule bg-night-2 p-4 transition-colors hover:border-aurora"
    >
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-lg font-semibold text-snow">{ichi.name}</h3>
        <MoodBadge ichi={ichi} />
      </div>
      <p className="mt-1 text-sm text-snow-2">
        {archetype?.name ?? ichi.archetype}
        {archetype ? ` — ${archetype.tagline}` : ""}
      </p>
      <p className="mt-3 text-xs text-snow-3">
        bond: {bond === null ? "none yet" : `${bond}/100, ${bondWords(bond)}`}
        {" · "}
        memories: {memoryCount}
      </p>
    </Link>
  );
}

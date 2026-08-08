import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { query } from "@/db";
import type { Memory, IchchiEvent } from "@/db/types";
import { currentUser } from "@/lib/session";
import { archetypeById, bondFor, getIchchi } from "@/lib/ichchi";
import { bondWordsRu } from "@/components/words";
import MoodBadge from "@/components/MoodBadge";
import TraitBars from "@/components/TraitBars";
import MemoryLog from "@/components/MemoryLog";
import EventLog from "@/components/EventLog";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const user = await currentUser();
  if (!user) return { title: "Душа — иччи" };
  const { slug } = await params;
  const ichchi = await getIchchi(user.id, slug);
  return { title: ichchi ? `${ichchi.name} — иччи` : "Душа — иччи" };
}

/** A small labelled 0..1 bar for stress and energy — same idiom as TraitBars. */
function Meter({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-24 shrink-0 text-xs text-snow-2">{label}</span>
      <div className="h-1.5 flex-1 rounded-full bg-night-3">
        <div
          className={`h-1.5 rounded-full ${color}`}
          style={{ width: `${Math.round(value * 100)}%` }}
        />
      </div>
      <span className="w-10 shrink-0 text-right font-mono text-xs text-snow-3">
        {value.toFixed(2)}
      </span>
    </div>
  );
}

/**
 * One ichchi's page: current state up top, then the visible log — what it
 * remembers and what happened to it. The log is the feature ("what the ichchi
 * learned"), so it gets most of the page, not a collapsed tab.
 */
export default async function IchchiPage({ params }: Props) {
  const user = await currentUser();
  if (!user) redirect("/sign-in");

  const { slug } = await params;
  const ichchi = await getIchchi(user.id, slug);
  if (!ichchi) notFound();

  const [bond, memories, events] = await Promise.all([
    bondFor(ichchi.id, user.id),
    query<Memory>(
      `select * from memories
        where ichchi_id = $1
        order by salience desc, created_at desc
        limit 20`,
      [ichchi.id],
    ),
    query<IchchiEvent>(
      `select * from ichchi_events
        where ichchi_id = $1
        order by created_at desc
        limit 30`,
      [ichchi.id],
    ),
  ]);

  const archetype = archetypeById(ichchi.archetype);
  const drift = Object.entries(ichchi.pending_drift ?? {});

  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-12">
      <Link href="/ichchi" className="text-xs text-snow-3 hover:text-snow">
        ← все души
      </Link>

      {/* Header */}
      <div className="mt-3 flex flex-wrap items-baseline gap-3">
        <h1 className="text-3xl font-semibold text-snow">{ichchi.name}</h1>
        <MoodBadge ichchi={ichchi} />
      </div>
      <p className="mt-1 text-sm text-snow-2">
        {archetype?.name ?? ichchi.archetype}
        {archetype ? ` — ${archetype.tagline}` : ""}
      </p>

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        {/* Traits */}
        <section className="rounded-lg border border-rule bg-night-2 p-5">
          <h2 className="mb-4 text-sm font-semibold text-snow">Характер</h2>
          <TraitBars ichchi={ichchi} />
          {drift.length > 0 && (
            <p className="mt-4 text-xs text-snow-3">
              Накопленный дрейф (
              {drift.map(([k, v]) => `${k} ${v > 0 ? "+" : ""}${v.toFixed(2)}`).join(", ")}
              ) — закрепится после рефлексии.
            </p>
          )}
        </section>

        {/* Relationship + condition */}
        <section className="rounded-lg border border-rule bg-night-2 p-5">
          <h2 className="mb-4 text-sm font-semibold text-snow">Состояние</h2>
          <div className="space-y-2.5">
            <div className="flex items-baseline justify-between text-sm">
              <span className="text-snow-2">Связь</span>
              <span className="text-snow">
                {bond.bond}/100 · {bondWordsRu(bond.bond)}
              </span>
            </div>
            <div className="flex items-baseline justify-between text-sm">
              <span className="text-snow-2">Доверие</span>
              <span className="text-snow">{bond.trust}/100</span>
            </div>
            <Meter label="Стресс" value={ichchi.stress} color="bg-berry" />
            <Meter label="Энергия" value={ichchi.energy} color="bg-frost" />
          </div>
          <p className="mt-4 text-xs text-snow-3">
            взаимодействий: {ichchi.interactions}
            {ichchi.reflected_at
              ? ` · последняя рефлексия ${ichchi.reflected_at.toLocaleDateString("ru-RU")}`
              : " · рефлексии ещё не было"}
          </p>
        </section>
      </div>

      {/* Voice */}
      <section className="mt-4 rounded-lg border border-rule bg-night-2 p-5">
        <h2 className="mb-2 text-sm font-semibold text-snow">Голос</h2>
        <p className="text-sm leading-relaxed text-snow-2">
          {ichchi.voice_notes ?? archetype?.voice ?? "—"}
        </p>
        {ichchi.voice_notes && archetype && (
          <p className="mt-2 text-xs text-snow-3">
            изначально: {archetype.voice}
          </p>
        )}
      </section>

      {/* What the ichchi learned */}
      <section className="mt-10">
        <h2 className="text-lg font-semibold text-snow">Память</h2>
        <p className="mt-1 mb-4 text-sm text-snow-3">
          Самые значимые воспоминания. Точка — окраска, полоска — как крепко
          держится.
        </p>
        <MemoryLog memories={memories} />
      </section>

      <section className="mt-10 mb-4">
        <h2 className="text-lg font-semibold text-snow">События</h2>
        <p className="mt-1 mb-4 text-sm text-snow-3">
          Последние {events.length} — вызовы, отзывы, рефлексии, остывание.
        </p>
        <EventLog events={events} />
      </section>
    </main>
  );
}

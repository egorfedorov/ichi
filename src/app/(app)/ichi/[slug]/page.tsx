import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { query } from "@/db";
import type { Letter, Memory, IchiEvent } from "@/db/types";
import { currentUser } from "@/lib/session";
import { archetypeById, bondFor, getIchi } from "@/lib/ichi";
import { bondWordsRu } from "@/components/words";
import MoodBadge from "@/components/MoodBadge";
import TraitBars from "@/components/TraitBars";
import MemoryLog from "@/components/MemoryLog";
import EventLog from "@/components/EventLog";
import Letters from "@/components/Letters";
import PublishToggle from "@/components/PublishToggle";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const user = await currentUser();
  if (!user) return { title: "Ичи" };
  const { slug } = await params;
  const ichi = await getIchi(user.id, slug);
  return { title: ichi ? `${ichi.name} — ичи` : "Ичи" };
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
 * One ichi's page: current state up top, then the visible log — what it
 * remembers and what happened to it. The log is the feature ("what the ichi
 * learned"), so it gets most of the page, not a collapsed tab.
 */
export default async function IchiPage({ params }: Props) {
  const user = await currentUser();
  if (!user) redirect("/");

  const { slug } = await params;
  const ichi = await getIchi(user.id, slug);
  if (!ichi) notFound();

  const [bond, memories, events, letters] = await Promise.all([
    bondFor(ichi.id, user.id),
    query<Memory>(
      `select * from memories
        where ichi_id = $1
        order by salience desc, created_at desc
        limit 20`,
      [ichi.id],
    ),
    query<IchiEvent>(
      `select * from ichi_events
        where ichi_id = $1
        order by created_at desc
        limit 30`,
      [ichi.id],
    ),
    query<Letter>(
      `select * from letters
        where ichi_id = $1
        order by period_start desc
        limit 8`,
      [ichi.id],
    ),
  ]);

  const archetype = archetypeById(ichi.archetype);
  const drift = Object.entries(ichi.pending_drift ?? {});

  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-12">
      <Link href="/ichi" className="text-xs text-snow-3 hover:text-snow">
        ← все ичи
      </Link>

      {/* Header */}
      <div className="mt-3 flex flex-wrap items-baseline gap-3">
        <h1 className="text-3xl font-semibold text-snow">{ichi.name}</h1>
        <MoodBadge ichi={ichi} />
      </div>
      <p className="mt-1 text-sm text-snow-2">
        {archetype?.name ?? ichi.archetype}
        {archetype ? ` — ${archetype.tagline}` : ""}
      </p>

      <div className="mt-6">
        <PublishToggle
          slug={ichi.slug}
          initialPublicSlug={ichi.public_slug}
          initialJoinCode={ichi.join_code}
          initialMortal={ichi.mortal}
          appUrl={env.NEXT_PUBLIC_APP_URL}
        />
      </div>

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        {/* Traits */}
        <section className="rounded-lg border border-rule bg-night-2 p-5">
          <h2 className="mb-4 text-sm font-semibold text-snow">Характер</h2>
          <TraitBars ichi={ichi} />
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
            <Meter label="Стресс" value={ichi.stress} color="bg-berry" />
            <Meter label="Энергия" value={ichi.energy} color="bg-frost" />
          </div>
          <p className="mt-4 text-xs text-snow-3">
            взаимодействий: {ichi.interactions}
            {ichi.reflected_at
              ? ` · последняя рефлексия ${ichi.reflected_at.toLocaleDateString("ru-RU")}`
              : " · рефлексии ещё не было"}
          </p>
        </section>
      </div>

      {/* Voice */}
      <section className="mt-4 rounded-lg border border-rule bg-night-2 p-5">
        <h2 className="mb-2 text-sm font-semibold text-snow">Голос</h2>
        <p className="text-sm leading-relaxed text-snow-2">
          {ichi.voice_notes ?? archetype?.voice ?? "—"}
        </p>
        {ichi.voice_notes && archetype && (
          <p className="mt-2 text-xs text-snow-3">
            изначально: {archetype.voice}
          </p>
        )}
      </section>

      {/* The one thing on this page written TO the reader. */}
      <section className="mt-10">
        <h2 className="text-lg font-semibold text-snow">Письма</h2>
        <p className="mt-1 mb-4 text-sm text-snow-3">
          Раз в неделю ичи рассказывает своими словами, как прошла неделя.
        </p>
        <Letters letters={letters} />
      </section>

      {/* What the ichi learned */}
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

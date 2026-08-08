import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { archetypeById, getPublicIchchi } from "@/lib/ichchi";
import { bondStage, nextStageAt, STAGE_PRIVILEGE } from "@/lib/bond";
import { bondWords, moodWords } from "@/lib/voice";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ slug: string }>;
}

/**
 * An ichchi's public face.
 *
 * This page is the growth loop: it exists to be shared. What makes it worth
 * sharing is that it is a portrait rather than a dashboard — a temperament
 * someone shaped over weeks, with the numbers as evidence rather than as the
 * point.
 *
 * It shows character, mood, attachment and counts. It never shows a memory
 * body, because a memory quotes the project it formed around (see migration
 * 0005). Publishing a temperament must not publish a codebase — that trade
 * would kill the feature the first time someone got burned by it.
 */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const ichchi = await getPublicIchchi(slug);
  if (!ichchi) return { title: "Not found — ichchi" };

  const archetype = archetypeById(ichchi.archetype);
  const mood = moodWords(ichchi);
  return {
    title: `${ichchi.name} — an ichchi`,
    description:
      `${ichchi.name} is ${archetype?.name ?? ichchi.archetype}, feeling ${mood}. ` +
      `${ichchi.interactions} interactions, ${ichchi.memory_count} memories, ` +
      `bond ${ichchi.top_bond}/100.`,
    openGraph: {
      type: "profile",
      url: `${env.NEXT_PUBLIC_APP_URL}/i/${ichchi.public_slug}`,
    },
  };
}

const TRAITS = [
  ["openness", "openness"],
  ["conscientiousness", "conscientiousness"],
  ["extraversion", "extraversion"],
  ["agreeableness", "agreeableness"],
  ["neuroticism", "neuroticism"],
] as const;

export default async function PublicIchchiPage({ params }: Props) {
  const { slug } = await params;
  const ichchi = await getPublicIchchi(slug);
  if (!ichchi) notFound();

  const archetype = archetypeById(ichchi.archetype);
  const mood = moodWords(ichchi);
  const stage = bondStage(ichchi.top_bond);
  const next = nextStageAt(ichchi.top_bond);
  const days = ichchi.age_days;

  return (
    <main className="shell py-14 sm:py-20">
      <p className="eyebrow">A living spirit for AI agents</p>

      <h1 className="display mt-4 text-5xl sm:text-6xl">{ichchi.name}</h1>
      <p className="mono mt-3 text-sm text-ink-2">
        {archetype?.name ?? ichchi.archetype} · {days} day{days === 1 ? "" : "s"} old ·{" "}
        {ichchi.interactions} interactions
      </p>

      <div className="mt-10 grid gap-5 sm:grid-cols-2">
        <div className="card" data-tint="green">
          <p className="mono text-xs tracking-[0.14em] uppercase opacity-80">right now</p>
          <h2 className="mt-2 text-3xl font-bold tracking-tight">{mood}</h2>
          <p className="mt-2 text-sm opacity-85">
            valence {ichchi.mood_valence.toFixed(2)} · stress {ichchi.stress.toFixed(2)} ·
            energy {ichchi.energy.toFixed(2)}
          </p>
        </div>

        <div className="card" data-tint="violet">
          <p className="mono text-xs tracking-[0.14em] uppercase opacity-80">attachment</p>
          <h2 className="mt-2 text-3xl font-bold tracking-tight">
            {ichchi.top_bond}/100 · {bondWords(ichchi.top_bond)}
          </h2>
          <p className="mt-2 text-sm opacity-85">
            {STAGE_PRIVILEGE[stage] ??
              "Still keeping its distance — nothing earned yet."}
            {next !== null && ` ${next - ichchi.top_bond} more to the next stage.`}
          </p>
        </div>
      </div>

      <section className="mt-12">
        <p className="eyebrow">Character</p>
        <div className="mt-4 max-w-xl space-y-2">
          {TRAITS.map(([key, label]) => (
            <div key={key} className="flex items-center gap-3">
              <span className="mono w-36 shrink-0 text-xs text-ink-2">{label}</span>
              <div className="h-2 flex-1 border-[1.5px] border-ink">
                <div
                  className={key === "neuroticism" ? "h-full bg-riso-red" : "h-full bg-ink"}
                  style={{ width: `${ichchi[key]}%` }}
                />
              </div>
              <span className="mono w-8 shrink-0 text-right text-xs text-ink-3">
                {ichchi[key]}
              </span>
            </div>
          ))}
        </div>
      </section>

      {ichchi.voice_notes && (
        <section className="mt-12">
          <p className="eyebrow">Convictions it formed</p>
          <p className="mt-3 max-w-xl text-base leading-relaxed text-ink-2">
            {ichchi.voice_notes}
          </p>
        </section>
      )}

      <section className="mt-12">
        <p className="eyebrow">What it carries</p>
        <p className="mt-3 max-w-xl text-base leading-relaxed text-ink-2">
          {ichchi.memory_count} memories, {ichchi.standard_count} of them standards its
          keeper works by.{" "}
          <span className="text-ink-3">
            The contents stay private — an ichchi&apos;s memories quote the work it was
            formed around, and that is its keeper&apos;s to share, not ours.
          </span>
        </p>
      </section>

      <div className="mt-14 border-t border-rule-paper pt-8">
        <p className="text-base text-ink-2">
          Every agent can have one.{" "}
          <Link
            href="/"
            className="underline decoration-riso-red decoration-2 underline-offset-4 hover:text-ink"
          >
            Summon your own ichchi
          </Link>
          .
        </p>
      </div>
    </main>
  );
}

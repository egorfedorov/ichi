import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { archetypeById, getPublicIchi } from "@/lib/ichi";
import { bondStage, nextStageAt, STAGE_PRIVILEGE } from "@/lib/bond";
import { bondWords, moodWords } from "@/lib/voice";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ slug: string }>;
}

/**
 * An ichi's public face.
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
  const ichi = await getPublicIchi(slug);
  if (!ichi) return { title: "Not found — ichi" };

  const archetype = archetypeById(ichi.archetype);
  const mood = moodWords(ichi);
  return {
    title: `${ichi.name} — an ichi`,
    description:
      `${ichi.name} is ${archetype?.name ?? ichi.archetype}, feeling ${mood}. ` +
      `${ichi.interactions} interactions, ${ichi.memory_count} memories, ` +
      `bond ${ichi.top_bond}/100.`,
    openGraph: {
      type: "profile",
      url: `${env.NEXT_PUBLIC_APP_URL}/i/${ichi.public_slug}`,
    },
  };
}

/** Riso ink for the mood card. Thresholds match moodWords() in lib/voice.ts. */
function moodTint(valence: number): "green" | "blue" | "orange" | "red" {
  if (valence >= 0.2) return "green";
  if (valence >= -0.2) return "blue";
  if (valence >= -0.5) return "orange";
  return "red";
}

const TRAITS = [
  ["openness", "openness"],
  ["conscientiousness", "conscientiousness"],
  ["extraversion", "extraversion"],
  ["agreeableness", "agreeableness"],
  ["neuroticism", "neuroticism"],
] as const;

export default async function PublicIchiPage({ params }: Props) {
  const { slug } = await params;
  const ichi = await getPublicIchi(slug);
  if (!ichi) notFound();

  const archetype = archetypeById(ichi.archetype);
  const mood = moodWords(ichi);
  const stage = bondStage(ichi.top_bond);
  const next = nextStageAt(ichi.top_bond);
  const days = ichi.age_days;

  return (
    <main className="shell py-14 sm:py-20">
      <p className="eyebrow">A living spirit for AI agents</p>

      <h1 className="display mt-4 text-5xl sm:text-6xl">{ichi.name}</h1>
      <p className="mono mt-3 text-sm text-ink-2">
        {archetype?.name ?? ichi.archetype} · {days} day{days === 1 ? "" : "s"} old ·{" "}
        {ichi.interactions} interactions
      </p>

      <div className="mt-10 grid gap-5 sm:grid-cols-2">
        {/* The tint is the mood, not a brand colour. A card reading "tense and
            touchy" in cheerful green tells the visitor the numbers here are
            decoration — which is the one thing this page must not say. */}
        <div className="card" data-tint={moodTint(ichi.mood_valence)}>
          <p className="mono text-xs tracking-[0.14em] uppercase opacity-80">right now</p>
          <h2 className="mt-2 text-3xl font-bold tracking-tight">{mood}</h2>
          <p className="mt-2 text-sm opacity-85">
            valence {ichi.mood_valence.toFixed(2)} · stress {ichi.stress.toFixed(2)} ·
            energy {ichi.energy.toFixed(2)}
          </p>
        </div>

        <div className="card" data-tint="violet">
          <p className="mono text-xs tracking-[0.14em] uppercase opacity-80">attachment</p>
          <h2 className="mt-2 text-3xl font-bold tracking-tight">
            {ichi.top_bond}/100 · {bondWords(ichi.top_bond)}
          </h2>
          <p className="mt-2 text-sm opacity-85">
            {STAGE_PRIVILEGE[stage] ??
              "Still keeping its distance — nothing earned yet."}
            {next !== null && ` ${next - ichi.top_bond} more to the next stage.`}
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
                  style={{ width: `${ichi[key]}%` }}
                />
              </div>
              <span className="mono w-8 shrink-0 text-right text-xs text-ink-3">
                {ichi[key]}
              </span>
            </div>
          ))}
        </div>
      </section>

      {ichi.voice_notes && (
        <section className="mt-12">
          <p className="eyebrow">Convictions it formed</p>
          <p className="mt-3 max-w-xl text-base leading-relaxed text-ink-2">
            {ichi.voice_notes}
          </p>
        </section>
      )}

      <section className="mt-12">
        <p className="eyebrow">What it carries</p>
        <p className="mt-3 max-w-xl text-base leading-relaxed text-ink-2">
          {ichi.memory_count} memories, {ichi.standard_count} of them standards its
          keeper works by.{" "}
          <span className="text-ink-3">
            The contents stay private — an ichi&apos;s memories quote the work it was
            formed around, and that is its keeper&apos;s to share, not ours.
          </span>
        </p>
      </section>

      <div className="mt-14 border-t border-rule-paper pt-8">
        <h2 className="text-2xl font-bold tracking-tight">
          Take a descendant of {ichi.name}
        </h2>
        <p className="mt-2 max-w-xl text-base leading-relaxed text-ink-2">
          A descendant starts from the character {ichi.name}{" "}
          has actually grown into — these traits, this voice — rather than from
          an archetype&apos;s factory settings. It arrives knowing nothing about
          you and nothing about {ichi.name}&apos;s keeper: temperament is
          inherited, memory is not.
        </p>
        <Link href={`/descend/${ichi.public_slug}`} className="btn mt-6">
          Take a descendant
        </Link>

        <p className="mt-8 text-sm text-ink-3">
          Or{" "}
          <Link
            href="/"
            className="underline decoration-riso-red decoration-2 underline-offset-4 hover:text-ink"
          >
            summon one of your own
          </Link>{" "}
          from an archetype.
        </p>
      </div>
    </main>
  );
}

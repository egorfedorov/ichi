"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { LandingDict } from "@/lib/landing-i18n";
import {
  BASELINE,
  DEMO_TRAITS,
  type IchchiEngine,
} from "@/components/landing/useIchchiEngine";
import { useReducedMotion } from "@/components/landing/useReducedMotion";

/**
 * The brain half of the split screen: what the ichchi actually is under the
 * chat. Four live instruments, all fed by the same engine —
 *
 *   ichchi_brief   the JSON block the agent receives with every request;
 *                a line flashes when its value changes
 *   sparkline    valence over the last ~40 ticks, against the baseline
 *   bond/traits  the slow numbers: attachment and the Big Five
 *   event log    every praise/scold/ask with its valence chip
 */

/** The JSON brief, as addressable lines so each can flash on its own. */
type BriefLine = { key: string; value: string; kind: "str" | "num" };

const TRAIT_KEYS = [
  "openness",
  "conscientiousness",
  "extraversion",
  "agreeableness",
  "neuroticism",
] as const;

export default function IchchiBrain({
  engine,
  t,
}: {
  engine: IchchiEngine;
  t: LandingDict["chat"];
}) {
  const { valence, mood, bond, history, events } = engine;
  const reduced = useReducedMotion();
  const logRef = useRef<HTMLDivElement>(null);

  const lastMemory = events.findLast((e) => e.kind !== "ask")?.text ?? "—";

  const lines = useMemo<BriefLine[]>(
    () => [
      { key: "mood", value: `"${t.moods[mood]}"`, kind: "str" },
      { key: "valence", value: valence.toFixed(2), kind: "num" },
      { key: "bond", value: String(Math.round(bond)), kind: "num" },
      {
        key: "traits",
        value: `"O${DEMO_TRAITS.openness} C${DEMO_TRAITS.conscientiousness} E${DEMO_TRAITS.extraversion} A${DEMO_TRAITS.agreeableness} N${DEMO_TRAITS.neuroticism}"`,
        kind: "str",
      },
      { key: "last_memory", value: `"${lastMemory}"`, kind: "str" },
    ],
    [valence, mood, bond, lastMemory, t.moods],
  );

  // Flash the lines whose value just changed. The flash is set and cleared
  // from timers, not during the effect body.
  const prevRef = useRef<Map<string, string> | null>(null);
  const [flash, setFlash] = useState<ReadonlySet<string>>(new Set());
  useEffect(() => {
    const prev = prevRef.current;
    prevRef.current = new Map(lines.map((l) => [l.key, l.value]));
    if (!prev || reduced) return;
    const changed = new Set(
      lines.filter((l) => prev.has(l.key) && prev.get(l.key) !== l.value).map((l) => l.key),
    );
    if (changed.size === 0) return;
    const on = setTimeout(() => setFlash(changed), 0);
    const off = setTimeout(() => setFlash(new Set()), 700);
    return () => {
      clearTimeout(on);
      clearTimeout(off);
    };
  }, [lines, reduced]);

  // The log follows the newest event.
  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [events]);

  // Sparkline geometry: valence −1..1 mapped into the viewBox, baseline dashed.
  const W = 100;
  const H = 36;
  const yOf = (v: number) => H - 2 - ((v + 1) / 2) * (H - 4);
  const points = history
    .map(
      (v, i) =>
        `${((i / Math.max(1, history.length - 1)) * W).toFixed(1)},${yOf(v).toFixed(1)}`,
    )
    .join(" ");

  return (
    <div className="scene scene-glow flex h-full min-h-0 flex-col gap-4 overflow-y-auto p-4">
      <p className="eyebrow" style={{ color: "#8d939c" }}>
        {t.brain.eyebrow}
      </p>

      {/* ichchi_brief — the payload itself. */}
      <div dir="ltr">
        <div className="mb-1.5 flex items-baseline justify-between gap-3">
          <p className="mono text-[11px] font-semibold text-riso-green">
            $ ichchi_brief
          </p>
          <p className="mono text-right text-[10px] leading-snug text-[#646b75]">
            {t.brain.briefNote}
          </p>
        </div>
        <div className="mono rounded-md border border-[#2a2f37] bg-[#101317] px-3 py-2.5 text-[11px] leading-relaxed">
          <div className="j-punc">{"{"}</div>
          {lines.map((l) => (
            <div
              key={l.key}
              data-flash={flash.has(l.key) || undefined}
              className="json-line -mx-1 rounded px-1"
            >
              <span className="j-punc">{"  "}</span>
              <span className="j-key">&quot;{l.key}&quot;</span>
              <span className="j-punc">: </span>
              <span className={l.kind === "num" ? "j-num" : "j-str"}>
                {l.value}
              </span>
              <span className="j-punc">,</span>
            </div>
          ))}
          <div className="j-punc">{"}"}</div>
        </div>
      </div>

      {/* Mood sparkline. */}
      <div dir="ltr">
        <div className="mb-1 flex items-baseline justify-between gap-3">
          <p className="mono text-[10px] tracking-[0.08em] text-[#8d939c] uppercase">
            {t.brain.moodHistory}
          </p>
          <p className="mono text-[10px] text-[#646b75]">
            - - {t.brain.baseline} {BASELINE}
          </p>
        </div>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          className="h-16 w-full rounded-md border border-[#2a2f37] bg-[#101317]"
          aria-hidden
        >
          <line
            x1="0"
            x2={W}
            y1={yOf(BASELINE)}
            y2={yOf(BASELINE)}
            stroke="#646b75"
            strokeWidth="1"
            strokeDasharray="3 3"
            vectorEffect="non-scaling-stroke"
          />
          <polyline
            points={points}
            fill="none"
            stroke="var(--color-riso-green)"
            strokeWidth="1.5"
            vectorEffect="non-scaling-stroke"
          />
          <circle
            cx={W}
            cy={yOf(valence)}
            r="2"
            fill="var(--color-riso-green)"
          />
        </svg>
      </div>

      {/* Bond + Big Five. */}
      <div className="space-y-2">
        <div>
          <div className="mono mb-1 flex justify-between text-[10px] tracking-[0.08em] text-[#8d939c] uppercase">
            <span>{t.bondWord}</span>
            <span className="text-[#e6e8ea]">{Math.round(bond)}/100</span>
          </div>
          <div className="h-1.5 rounded-full bg-[#1e2228]">
            <div
              className="h-full rounded-full bg-riso-violet transition-[width] duration-500"
              style={{ width: `${bond}%` }}
            />
          </div>
        </div>
        {TRAIT_KEYS.map((k) => (
          <div key={k} className="flex items-center gap-2">
            <span className="mono w-28 shrink-0 truncate text-[10px] text-[#8d939c]">
              {t.brain.traits[k]}
            </span>
            <div className="h-1 min-w-0 flex-1 rounded-full bg-[#1e2228]">
              <div
                className={`h-full rounded-full ${k === "neuroticism" ? "bg-riso-red/80" : "bg-[#8d939c]"}`}
                style={{ width: `${DEMO_TRAITS[k]}%` }}
              />
            </div>
            <span className="mono w-6 shrink-0 text-right text-[10px] text-[#646b75]">
              {DEMO_TRAITS[k]}
            </span>
          </div>
        ))}
      </div>

      {/* Event log. */}
      <div className="min-h-0">
        <p className="mono mb-1 text-[10px] tracking-[0.08em] text-[#8d939c] uppercase">
          {t.brain.events}
        </p>
        <div
          ref={logRef}
          dir="ltr"
          className="mono max-h-28 space-y-1 overflow-y-auto rounded-md border border-[#2a2f37] bg-[#101317] px-2.5 py-2 text-[10.5px] leading-relaxed"
        >
          {events.length === 0 && (
            <p className="text-[#646b75]">— ichchi_feedback —</p>
          )}
          {events.map((e) => (
            <p key={e.id} className="flex items-baseline gap-2">
              <span
                className={`shrink-0 ${
                  e.delta === null
                    ? "text-[#646b75]"
                    : e.delta > 0
                      ? "text-riso-green"
                      : "text-riso-red"
                }`}
              >
                {e.delta === null
                  ? " ±0.00"
                  : ` ${e.delta > 0 ? "+" : "−"}${Math.abs(e.delta).toFixed(2)}`}
              </span>
              <span className="truncate text-[#c8cdd4]">&quot;{e.text}&quot;</span>
            </p>
          ))}
        </div>
      </div>
    </div>
  );
}

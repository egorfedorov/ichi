"use client";

import { useEffect, useRef } from "react";
import type { LandingDict } from "@/lib/landing-i18n";
import { useIchchiEngine } from "@/components/landing/useIchchiEngine";
import { useConsoleMotion } from "@/components/landing/useConsoleMotion";
import { useVisitorMemory } from "@/components/landing/useVisitorMemory";
import Terminal from "@/components/landing/Terminal";
import IchchiCore from "@/components/landing/IchchiCore";
import IchchiBrain from "@/components/landing/IchchiBrain";

/**
 * The whole landing, on one screen.
 *
 * One engine underneath three panes, which is what makes the page argue for
 * itself: scold the ichchi in the terminal and the core changes colour and
 * slows, the brief's mood line flashes, the sparkline turns down — all in the
 * same render, because all three read the same state. A visitor does not have
 * to be told the mood is real; they cause it.
 */
export default function Console({ t }: { t: LandingDict }) {
  const { memory, greeting: recalled, remember } = useVisitorMemory();
  const engine = useIchchiEngine(
    t.chat,
    memory ? { valence: memory.valence, bond: memory.bond } : null,
  );
  const root = useRef<HTMLDivElement>(null);
  useConsoleMotion(root, engine.valence);

  // Persist the mood as it moves, so the next visit picks up the grudge. The
  // last action is read off the event log rather than tracked separately —
  // one source of truth for "what did they do to it".
  useEffect(() => {
    if (!memory) return;
    const last = engine.events.findLast((e) => e.kind !== "ask");
    remember({
      valence: engine.valence,
      bond: engine.bond,
      lastAction: last ? (last.kind as "praise" | "scold") : memory.lastAction,
    });
  }, [engine.valence, engine.bond, engine.events, memory, remember]);

  // The line the boot ends on: the stock greeting on a first visit, the
  // ichchi recognising you on any later one. null until the memory is read,
  // which is what the boot waits for.
  const greeting = memory === null ? null : (recalled ?? t.chat.greeting);

  return (
    <div className="console" ref={root}>
      <section className="console-stage" aria-label={t.cli.agents}>
        <IchchiCore
          mood={engine.mood}
          valence={engine.valence}
          bond={engine.bond}
          label="Ichchi"
        />
        <p className="console-stage-label mono">{t.cli.agents}</p>
      </section>

      <section className="console-term" aria-label="ichchi console">
        <Terminal engine={engine} t={t} greeting={greeting} />
      </section>

      <section className="console-brain" aria-label={t.chat.brain.eyebrow}>
        <IchchiBrain engine={engine} t={t.chat} />
      </section>
    </div>
  );
}

"use client";

import { useRef } from "react";
import type { LandingDict } from "@/lib/landing-i18n";
import { useIchchiEngine } from "@/components/landing/useIchchiEngine";
import { useConsoleMotion } from "@/components/landing/useConsoleMotion";
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
  const engine = useIchchiEngine(t.chat);
  const root = useRef<HTMLDivElement>(null);
  useConsoleMotion(root, engine.valence);

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
        <Terminal engine={engine} t={t} />
      </section>

      <section className="console-brain" aria-label={t.chat.brain.eyebrow}>
        <IchchiBrain engine={engine} t={t.chat} />
      </section>
    </div>
  );
}

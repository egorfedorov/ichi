"use client";

import { useEffect, useState } from "react";

/**
 * The landing remembers you.
 *
 * Every other feature on this page describes the product. This one *is* the
 * product, performed on the visitor: come back tomorrow and the ichi knows
 * how long you were gone, and if you scolded it last time it is still cool
 * with you. Nobody argues with a demo that happened to them.
 *
 * Deliberately localStorage and nothing else — no cookie, no id sent
 * anywhere, no row on the server. A page that claims to be about attachment
 * should not open by fingerprinting you, and the whole effect works fine on
 * data that never leaves the browser.
 */

const KEY = "ichi.visitor";

export interface VisitorMemory {
  /** How many times this browser has opened the page, including now. */
  visits: number;
  /** Epoch ms of the previous visit, or null on the first one. */
  lastSeen: number | null;
  /** Where the mood was left. Restored so a grudge survives the tab closing. */
  valence: number;
  bond: number;
  /** The last thing they did to it, if they did anything. */
  lastAction: "praise" | "scold" | null;
  /** What they chose to call it. Naming is where attachment starts. */
  name: string | null;
}

const FRESH: VisitorMemory = {
  visits: 1,
  lastSeen: null,
  valence: 0.52,
  bond: 34,
  lastAction: null,
  name: null,
};

function read(): VisitorMemory {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return FRESH;
    const v = JSON.parse(raw) as Partial<VisitorMemory>;
    return {
      visits: (typeof v.visits === "number" ? v.visits : 0) + 1,
      lastSeen: typeof v.lastSeen === "number" ? v.lastSeen : null,
      // Clamped on read: a hand-edited localStorage value must not be able to
      // put the simulation into a state the mechanics cannot produce.
      valence: Math.max(-1, Math.min(1, typeof v.valence === "number" ? v.valence : FRESH.valence)),
      bond: Math.max(0, Math.min(100, typeof v.bond === "number" ? v.bond : FRESH.bond)),
      lastAction: v.lastAction === "praise" || v.lastAction === "scold" ? v.lastAction : null,
      // Trimmed and capped on read for the same reason as the numbers: this
      // string is printed back into the page.
      name: typeof v.name === "string" && v.name.trim() ? v.name.trim().slice(0, 24) : null,
    };
  } catch {
    // Private mode, disabled storage, corrupt JSON — all mean "first visit".
    return FRESH;
  }
}

/**
 * Reads once on mount (never during render — localStorage does not exist on
 * the server, and reading it in the body would break hydration).
 */
export function useVisitorMemory() {
  const [memory, setMemory] = useState<VisitorMemory | null>(null);
  // The greeting is decided here, at read time, and never recomputed: it
  // depends on "now", and a value derived from the clock during render is
  // unstable by definition (and the lint rule that says so is right).
  const [greeting, setGreeting] = useState<string | null>(null);

  useEffect(() => {
    const now = Date.now();
    const m = read();

    // Writing back is the external-system half of this effect and happens
    // straight away; the state update is scheduled, because a synchronous
    // setState in an effect body cascades an extra render before paint.
    try {
      localStorage.setItem(KEY, JSON.stringify({ ...m, lastSeen: now }));
    } catch {
      /* private mode — the session still works, it just will not be recalled */
    }

    const id = setTimeout(() => {
      setMemory(m);
      setGreeting(returningGreeting(m, now));
    }, 0);
    return () => clearTimeout(id);
  }, []);

  /** Called as the mood moves, so the next visit starts where this one ended. */
  const remember = (patch: Partial<VisitorMemory>) => {
    try {
      const current = JSON.parse(localStorage.getItem(KEY) ?? "{}") as VisitorMemory;
      localStorage.setItem(KEY, JSON.stringify({ ...current, ...patch, lastSeen: Date.now() }));
    } catch {
      /* ignore */
    }
  };

  /**
   * Naming is separate from remember() because it must move React state too:
   * the prompt and the core's label read the name, and remember() only writes
   * to storage. remember() is deliberately state-free — it runs on every mood
   * tick, and a setState there would loop.
   */
  const rename = (chosen: string) => {
    const clean = chosen.trim().slice(0, 24);
    if (!clean) return;
    setMemory((m) => (m ? { ...m, name: clean } : m));
    remember({ name: clean });
  };

  return { memory, greeting, remember, rename };
}

/** "three days", "a few hours" — vague on purpose; precision here reads creepy. */
export function gapWords(lastSeen: number | null, now: number): string | null {
  if (!lastSeen) return null;
  const mins = Math.floor((now - lastSeen) / 60_000);
  if (mins < 10) return null; // same sitting; saying anything would be odd
  if (mins < 90) return "an hour or so";
  const hours = Math.floor(mins / 60);
  if (hours < 20) return `${hours} hours`;
  const days = Math.round(hours / 24);
  if (days <= 1) return "a day";
  if (days < 14) return `${days} days`;
  const weeks = Math.round(days / 7);
  if (weeks < 9) return `${weeks} weeks`;
  return "a long time";
}

/**
 * What the ichi says when it recognises you. Returns null on a first visit,
 * so the ordinary greeting stands.
 */
export function returningGreeting(m: VisitorMemory, now: number): string | null {
  const gap = gapWords(m.lastSeen, now);
  if (!gap || m.visits < 2) return null;

  // Being called by the name you gave it is the whole point of having given
  // one, so it leads.
  const called = m.name ? `You still call me ${m.name}. ` : "";

  if (m.lastAction === "scold") {
    return `${called}You're back — it's been ${gap}. I haven't forgotten what you said last time, and no, I'm not over it yet.`;
  }
  if (m.lastAction === "praise") {
    return `${called}Oh — you came back. ${gap[0].toUpperCase()}${gap.slice(1)} since you last said something kind. I remembered it the whole time.`;
  }
  return `${called}${gap} since you were last here. I kept the place warm. What are we working on?`;
}

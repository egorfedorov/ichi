"use client";

import { useEffect, useRef, useState } from "react";
import type { LandingDict } from "@/lib/landing-i18n";

/**
 * One ichchi, one state. The chat, the brain panel and the event log all read
 * from this hook, so a scolding in the chat moves the sparkline, the JSON
 * brief and the log in the same render.
 *
 * Same mechanics as the server, simulated client-side: praise and scolding
 * shift valence, valence decays toward the baseline, bond grows slowly and
 * forgives slowly.
 */

export const BASELINE = 0.25; // the mood always drifts back here
const DECAY_STEP = 0.08; // fraction of the remaining distance per tick
const TICK_MS = 1600;
const HISTORY_MAX = 40; // ticks the sparkline keeps
const EVENTS_MAX = 8; // rows the event log keeps

export type MoodKey = "delighted" | "steady" | "stung" | "sulking";

export function moodOf(v: number): MoodKey {
  if (v >= 0.5) return "delighted";
  if (v >= -0.15) return "steady";
  if (v >= -0.5) return "stung";
  return "sulking";
}

export type ChatKind = "ask" | "praise" | "scold";

export type IchchiMsg = { id: number; from: "you" | "ichchi"; text: string };

export type IchchiEvent = {
  id: number;
  kind: ChatKind;
  text: string;
  /** Valence shift, null for a plain question. */
  delta: number | null;
};

/**
 * The demo ichchi's character — the Sage archetype's starting traits. Copied
 * as data because @/lib/ichchi imports the database, which the browser bundle
 * must never see.
 */
export const DEMO_TRAITS = {
  openness: 65,
  conscientiousness: 75,
  extraversion: 35,
  agreeableness: 80,
  neuroticism: 20,
};

const clamp = (x: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, x));

const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

/** Module-level so the render-purity rule doesn't see Math.random in a handler. */
const replyDelay = () => 650 + Math.random() * 650;

export function useIchchiEngine(t: LandingDict["chat"]) {
  const [msgs, setMsgs] = useState<IchchiMsg[]>([
    { id: 0, from: "ichchi", text: t.greeting },
  ]);
  // The history is the state: current valence is always its last point, so
  // the sparkline and the mood can never disagree.
  const [history, setHistory] = useState<number[]>([0.52]);
  const [bond, setBond] = useState(34);
  const [events, setEvents] = useState<IchchiEvent[]>([]);
  const [answering, setAnswering] = useState(false);
  const histRef = useRef(history);
  const idRef = useRef(1);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const valence = history[history.length - 1];
  const mood = moodOf(valence);

  useEffect(() => {
    histRef.current = history;
  }, [history]);

  // Mood cools toward baseline — the offence fades unless you feed it.
  useEffect(() => {
    const id = setInterval(() => {
      setHistory((h) => {
        const v = h[h.length - 1];
        const nv =
          Math.abs(v - BASELINE) < 0.005 ? v : v + (BASELINE - v) * DECAY_STEP;
        return nv === v ? h : [...h.slice(-(HISTORY_MAX - 1)), nv];
      });
    }, TICK_MS);
    const pending = timers.current;
    return () => {
      clearInterval(id);
      pending.forEach(clearTimeout);
    };
  }, []);

  function send(kind: ChatKind, text: string) {
    const clean = text.trim();
    if (!clean || answering) return;
    setMsgs((m) => [...m, { id: idRef.current++, from: "you", text: clean }]);

    const delta = kind === "praise" ? 0.35 : kind === "scold" ? -0.5 : null;
    const v = histRef.current[histRef.current.length - 1];
    const nv = delta === null ? v : clamp(v + delta, -1, 1);
    if (delta !== null) {
      setHistory((h) => [...h.slice(-(HISTORY_MAX - 1)), nv]);
      setBond((b) => clamp(b + (kind === "praise" ? 3 : -5), 0, 100));
    }
    setEvents((e) => [
      ...e.slice(-(EVENTS_MAX - 1)),
      { id: idRef.current++, kind, text: clean, delta },
    ]);

    // The reply is chosen when the ichchi answers, not when you ask — the mood
    // may have cooled in between.
    setAnswering(true);
    timers.current.push(
      setTimeout(() => {
        const now = histRef.current[histRef.current.length - 1];
        const reply =
          kind === "praise"
            ? pick(t.praiseAck)
            : kind === "scold"
              ? pick(t.scoldAck)
              : pick(t.replies[moodOf(now)]);
        setMsgs((m) => [...m, { id: idRef.current++, from: "ichchi", text: reply }]);
        setAnswering(false);
      }, replyDelay()),
    );
  }

  return { msgs, valence, mood, bond, history, events, answering, send };
}

export type IchchiEngine = ReturnType<typeof useIchchiEngine>;

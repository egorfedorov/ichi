import type { Ichi } from "@/db/types";

/**
 * Russian word-forms of the ichi's state for the web UI. voice.ts renders the
 * same state in English for agents; duplicating the ladder here instead of
 * parameterising it keeps the agent-facing copy free to change without
 * touching the interface language.
 */

/** Same thresholds as voice.ts moodWords — the page and the agent must agree. */
export function moodWordsRu(ichi: Ichi): string {
  const { mood_valence: v, mood_arousal: a, stress, energy } = ichi;
  if (v <= -0.5 && a >= 0.3) return "задет и на взводе";
  if (v <= -0.5) return "обижен, ушёл в себя";
  if (v <= -0.2 && stress >= 0.6) return "напряжён и обидчив";
  if (v <= -0.2) return "приглушён";
  if (v >= 0.5 && a >= 0.3) return "в восторге";
  if (v >= 0.5) return "тепло и доволен";
  if (v >= 0.2) return "тихо доволен";
  if (stress >= 0.6) return "на нервах";
  if (energy <= 0.25) return "устал";
  if (a >= 0.4) return "беспокоен";
  return "ровный";
}

/** Same ladder as voice.ts bondWords. */
export function bondWordsRu(bond: number): string {
  if (bond >= 80) return "предан";
  if (bond >= 60) return "близко";
  if (bond >= 40) return "пригревается";
  if (bond >= 20) return "насторожен";
  return "чужой";
}

/** "5 минут назад" — logs read as a story, timestamps as context. */
export function ago(date: Date | string): string {
  const seconds = Math.max(0, (Date.now() - new Date(date).getTime()) / 1000);
  if (seconds < 60) return "только что";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return plural(minutes, "минуту", "минуты", "минут");
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return plural(hours, "час", "часа", "часов");
  const days = Math.floor(hours / 24);
  if (days < 30) return plural(days, "день", "дня", "дней");
  return new Date(date).toLocaleDateString("ru-RU");
}

function plural(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  const word =
    mod10 === 1 && mod100 !== 11
      ? one
      : mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)
        ? few
        : many;
  return `${n} ${word} назад`;
}

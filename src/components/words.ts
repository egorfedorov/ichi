/**
 * Formatting helpers for the signed-in pages.
 *
 * This file used to carry Russian mood and bond vocabulary as well, plus a
 * Russian pluraliser. That was a second source of truth for something
 * lib/voice.ts already says in English — and it meant the signed-in pages
 * spoke Russian no matter which language the reader had chosen on the landing.
 * The vocabulary is gone; voice.ts owns it.
 */

/** "just now", "4 h ago", "12 d ago" — coarse on purpose. */
export function ago(date: Date | string): string {
  const seconds = Math.max(0, (Date.now() - new Date(date).getTime()) / 1000);
  if (seconds < 60) return "just now";

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;

  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} d ago`;

  // Past a month the exact day matters more than the distance, and ISO is the
  // one date format that is unambiguous in every locale.
  return new Date(date).toISOString().slice(0, 10);
}

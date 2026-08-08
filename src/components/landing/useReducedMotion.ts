"use client";

import { useSyncExternalStore } from "react";

/**
 * The reader's prefers-reduced-motion setting, live. Everything decorative
 * (typing effect, line flashes, looping terminals) checks this and renders
 * its final state instantly instead. Server snapshot is false — motion is
 * the default until the browser says otherwise.
 */

const QUERY = "(prefers-reduced-motion: reduce)";

function subscribe(onChange: () => void) {
  const mq = window.matchMedia(QUERY);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

const snapshot = () => window.matchMedia(QUERY).matches;
const serverSnapshot = () => false;

export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, snapshot, serverSnapshot);
}

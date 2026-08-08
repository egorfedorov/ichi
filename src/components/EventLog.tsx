import type { IchchiEvent } from "@/db/types";
import { ago } from "./words";

/** One readable line per event — the log is a story, not a table. */
function describe(ev: IchchiEvent): string {
  switch (ev.kind) {
    case "feedback":
      if (ev.signal === "praise") return "похвала";
      if (ev.signal === "scold") return "ругань";
      return "отзыв";
    case "reflect":
      return "рефлексия";
    case "decay":
      return "остывание";
    case "call":
      return ev.tool ? `вызов ${ev.tool}` : "вызов";
  }
}

/**
 * Recent ichchi_events, newest first. Praise/scold get colour because they are
 * the events a user scans for after giving feedback; calls and decay stay
 * quiet.
 */
export default function EventLog({ events }: { events: IchchiEvent[] }) {
  if (events.length === 0) {
    return (
      <p className="text-sm text-snow-3">
        Событий ещё нет — они появляются с первого обращения к иччи.
      </p>
    );
  }

  return (
    <ul className="divide-y divide-rule rounded-lg border border-rule bg-night-2">
      {events.map((ev) => (
        <li key={ev.id} className="flex items-baseline gap-3 px-4 py-2.5">
          <span
            className={`w-28 shrink-0 text-xs ${
              ev.kind === "feedback"
                ? ev.signal === "praise"
                  ? "text-aurora"
                  : "text-berry"
                : "text-snow-3"
            }`}
          >
            {describe(ev)}
          </span>
          <span className="min-w-0 flex-1 truncate text-sm text-snow-2">
            {ev.text ?? "—"}
          </span>
          <span className="shrink-0 text-xs text-snow-3">
            {ago(ev.created_at)}
          </span>
        </li>
      ))}
    </ul>
  );
}

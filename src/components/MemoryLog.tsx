import type { Memory, MemoryKind } from "@/db/types";
import { ago } from "./words";

const KIND_LABELS: Record<MemoryKind, string> = {
  event: "событие",
  insult: "обида",
  praise: "похвала",
  belief: "убеждение",
  fact: "факт",
  standard: "правило",
};

/**
 * The ichi's memory log. The dot is valence (warm/hurt/neutral), the bar is
 * salience — how firmly the memory is held. This is the "what the ichi
 * learned" surface; ordering by salience happens in the page's query.
 */
export default function MemoryLog({ memories }: { memories: Memory[] }) {
  if (memories.length === 0) {
    return (
      <p className="text-sm text-snow-3">
        Пока ничего не помнит. Первые воспоминания появятся после общения через
        MCP.
      </p>
    );
  }

  return (
    <ul className="divide-y divide-rule rounded-lg border border-rule bg-night-2">
      {memories.map((m) => (
        <li key={m.id} className="px-4 py-3">
          <div className="flex items-baseline justify-between gap-3">
            <span className="flex items-center gap-2 text-xs text-snow-3">
              <span
                className={`inline-block h-2 w-2 rounded-full ${
                  m.valence <= -0.2
                    ? "bg-berry"
                    : m.valence >= 0.2
                      ? "bg-aurora"
                      : "bg-snow-3"
                }`}
              />
              {KIND_LABELS[m.kind]} · {ago(m.created_at)}
            </span>
            <span
              className="h-1 w-16 shrink-0 rounded-full bg-night-3"
              title={`значимость ${m.salience.toFixed(2)}`}
            >
              <span
                className="block h-1 rounded-full bg-frost"
                style={{ width: `${Math.round(m.salience * 100)}%` }}
              />
            </span>
          </div>
          <p className="mt-1.5 text-sm leading-relaxed text-snow">{m.body}</p>
        </li>
      ))}
    </ul>
  );
}

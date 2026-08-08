import type { Letter } from "@/db/types";

/**
 * The ichi's letters, newest first.
 *
 * Given the most prominent place on the page under the state panels, because
 * this is the only thing here written *to* the reader — everything else is
 * instrumentation about them. The numbers sit beside the prose rather than
 * inside it: the letter is allowed to be a letter, and the week's tally is
 * there for anyone who wants to check it against the words.
 */
export default function Letters({ letters }: { letters: Letter[] }) {
  if (letters.length === 0) {
    return (
      <p className="text-sm text-snow-3">
        Писем ещё нет. Ичи пишет раз в неделю, по понедельникам — и только
        если на неделе было о чём рассказать.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      {letters.map((l) => {
        const s = l.stats as {
          events?: number;
          praise?: number;
          scold?: number;
          memories?: number;
        };
        return (
          <article key={l.id} className="border-l-2 border-rule ps-4">
            <p className="font-mono text-xs text-snow-3">
              неделя с {new Date(l.period_start).toISOString().slice(0, 10)}
            </p>
            <p className="mt-2 text-sm leading-relaxed whitespace-pre-line text-snow">
              {l.body}
            </p>
            <p className="mt-3 font-mono text-xs text-snow-3">
              {s.events ?? 0} обращений · {s.praise ?? 0} похвал ·{" "}
              {s.scold ?? 0} упрёков · {s.memories ?? 0} запомнено
            </p>
          </article>
        );
      })}
    </div>
  );
}

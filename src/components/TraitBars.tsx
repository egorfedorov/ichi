import type { Ichi, TraitName } from "@/db/types";

const LABELS: Record<TraitName, string> = {
  openness: "Открытость",
  conscientiousness: "Добросовестность",
  extraversion: "Экстраверсия",
  agreeableness: "Доброжелательность",
  neuroticism: "Невротизм",
};

const ORDER: TraitName[] = [
  "openness",
  "conscientiousness",
  "extraversion",
  "agreeableness",
  "neuroticism",
];

/**
 * Big Five as bars. Neuroticism is tinted ember rather than aurora: high is
 * not "better", and a green bar would imply a score to maximise.
 */
export default function TraitBars({ ichi }: { ichi: Ichi }) {
  return (
    <div className="space-y-2.5">
      {ORDER.map((trait) => {
        const value = ichi[trait];
        return (
          <div key={trait} className="flex items-center gap-3">
            <span className="w-40 shrink-0 text-xs text-snow-2">
              {LABELS[trait]}
            </span>
            <div className="h-1.5 flex-1 rounded-full bg-night-3">
              <div
                className={`h-1.5 rounded-full ${
                  trait === "neuroticism" ? "bg-ember" : "bg-aurora"
                }`}
                style={{ width: `${value}%` }}
              />
            </div>
            <span className="w-8 shrink-0 text-right font-mono text-xs text-snow-3">
              {value}
            </span>
          </div>
        );
      })}
    </div>
  );
}

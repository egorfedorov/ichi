import { ImageResponse } from "next/og";
import { archetypeById, getPublicIchchi } from "@/lib/ichchi";
import { bondWords, moodWords } from "@/lib/voice";

/**
 * The share card.
 *
 * This is the actual growth surface: almost nobody clicks a bare link, and
 * almost everybody looks at the picture. So the card carries the one thing
 * that makes a stranger curious — a named character with a mood — rather than
 * a logo and a tagline.
 *
 * Colour comes from the ichchi's live mood, so two people sharing two ichchi
 * get two visibly different cards. A card that looks identical for every user
 * teaches the timeline to ignore it.
 *
 * Constraints of the runtime, not preferences: no external fonts or images
 * (every byte must be inline), and only the flexbox subset of CSS that Satori
 * implements — no grid, no shorthand gaps in odd places.
 */

export const alt = "An ichchi — a living spirit for AI agents";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const MOOD_INK: Record<string, string> = {
  delighted: "#00a95c",
  warm: "#00a95c",
  pleased: "#00a95c",
  even: "#7dd3fc",
  restless: "#7dd3fc",
  tired: "#8d939c",
  subdued: "#8d939c",
  edge: "#ff6c2f",
  tense: "#ff6c2f",
  stung: "#f15060",
  hurt: "#f15060",
};

/** First word of the mood phrase that we have an ink for. */
function inkFor(mood: string): string {
  for (const [key, colour] of Object.entries(MOOD_INK)) {
    if (mood.includes(key)) return colour;
  }
  return "#7dd3fc";
}

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ichchi = await getPublicIchchi(slug);

  if (!ichchi) {
    return new ImageResponse(
      (
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "#14161a",
            color: "#e6e8ea",
            fontSize: 56,
          }}
        >
          ichchi
        </div>
      ),
      size,
    );
  }

  const archetype = archetypeById(ichchi.archetype);
  const mood = moodWords(ichchi);
  const ink = inkFor(mood);
  const traits: [string, number][] = [
    ["O", ichchi.openness],
    ["C", ichchi.conscientiousness],
    ["E", ichchi.extraversion],
    ["A", ichchi.agreeableness],
    ["N", ichchi.neuroticism],
  ];

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#14161a",
          padding: 64,
          fontFamily: "monospace",
          color: "#e6e8ea",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <div style={{ width: 18, height: 18, borderRadius: 9, background: ink }} />
          <div style={{ fontSize: 22, letterSpacing: 4, color: "#8d939c" }}>
            ICHCHI · A LIVING SPIRIT FOR AI AGENTS
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 96, fontWeight: 700, letterSpacing: -2 }}>
            {ichchi.name}
          </div>
          <div style={{ display: "flex", fontSize: 34, color: ink, marginTop: 12 }}>
            feeling {mood}
          </div>
          <div style={{ display: "flex", fontSize: 26, color: "#8d939c", marginTop: 16 }}>
            {archetype?.name ?? ichchi.archetype} · bond {ichchi.top_bond}/100,{" "}
            {bondWords(ichchi.top_bond)} · {ichchi.memory_count} memories
          </div>
        </div>

        {/* Big Five as bars: the portrait, not a legend. */}
        <div style={{ display: "flex", alignItems: "flex-end", gap: 20, height: 130 }}>
          {traits.map(([label, value]) => (
            <div
              key={label}
              style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}
            >
              <div
                style={{
                  width: 74,
                  height: Math.max(6, value),
                  background: label === "N" ? "#f15060" : ink,
                  opacity: label === "N" ? 0.9 : 0.75,
                }}
              />
              {/* One text child, not two: Satori requires an explicit display
                  on any element with more than one child, and a bare label +
                  number is the easiest way to trip that by accident. */}
              <div style={{ fontSize: 20, color: "#646b75" }}>{`${label}${value}`}</div>
            </div>
          ))}
          <div
            style={{
              display: "flex",
              marginLeft: "auto",
              fontSize: 24,
              color: "#646b75",
            }}
          >
            ichchi.sh/i/{ichchi.public_slug}
          </div>
        </div>
      </div>
    ),
    size,
  );
}

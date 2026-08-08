"use client";

import { useId } from "react";
import type { MoodKey } from "@/components/landing/useIchiEngine";
import { useReducedMotion } from "@/components/landing/useReducedMotion";

/**
 * The ichi itself, drawn.
 *
 * A core that breathes, and traffic running both ways along the wires to every
 * agent it rides in. The two directions are the whole product in one picture:
 * prompts and feedback climb UP from the tools you work in, mood and memory
 * flow DOWN into the next reply. A one-way animation would have described a
 * config file.
 *
 * Motion here is caused, never decorative. Colour, pace and the shock of a
 * scolding all come from the live engine, so what a visitor sees moving is
 * something they did — which is the one thing a looping hero cannot buy.
 *
 * Two motion systems, on purpose:
 *   SMIL  <animateMotion> for particles following a curve — the one thing SVG
 *         does natively and better than any JS scheduler.
 *   GSAP  for everything staged or reactive (see useConsoleMotion): the boot
 *         sequence, the flare on praise, the shake on a scolding.
 *
 * Everything is drawn through the pencil filter, so the wires read as sketched
 * rather than plotted — the same hand as the rest of the identity.
 */

const AGENTS = ["Claude Code", "Cursor", "Codex", "ChatGPT", "your agent"];

/**
 * The canvas is deliberately wide. The stage is a landscape band across the
 * top of the console, and a squarer viewBox letterboxed inside it — leaving
 * dead space either side of the subject, which read as a mistake rather than
 * as composition.
 */
const W = 900;
const H = 340;
const CORE = { x: W / 2, y: 96 };
const FOOT_Y = 276;

/**
 * The point everything in the core scales about, in SVG user units.
 *
 * Exported because GSAP needs it too: for SVG it computes its own matrix and
 * takes the pivot from `svgOrigin`, so the motion layer and this drawing must
 * agree on one number or the flare scales about the canvas corner.
 */
export const CORE_ORIGIN = `${CORE.x} ${CORE.y}`;

const MOOD_INK: Record<MoodKey, string> = {
  delighted: "var(--color-riso-green)",
  steady: "var(--color-frost)",
  stung: "var(--color-riso-orange)",
  sulking: "var(--color-riso-red)",
};

/** Faster when roused, sluggish when hurt — the pace reads before the colour. */
function pace(valence: number): number {
  return 3.6 - Math.max(-1, Math.min(1, valence)) * 1.1;
}

/**
 * The silhouette: a rounded hood over a wisped hem. Drawn once as a constant
 * because it never changes — only its colour and its eyes do.
 */
const SPIRIT_PATH = (() => {
  const { x: cx, y: cy } = CORE;
  const w = 56;
  return [
    `M ${cx - w} ${cy + 30}`,
    `C ${cx - w} ${cy - 72}, ${cx + w} ${cy - 72}, ${cx + w} ${cy + 30}`,
    `L ${cx + w} ${cy + 42}`,
    `Q ${cx + w * 0.62} ${cy + 70}, ${cx + w * 0.3} ${cy + 44}`,
    `Q ${cx} ${cy + 72}, ${cx - w * 0.3} ${cy + 44}`,
    `Q ${cx - w * 0.62} ${cy + 70}, ${cx - w} ${cy + 42}`,
    "Z",
  ].join(" ");
})();

/**
 * The face, by mood. This is the whole reason the core is a creature rather
 * than a chart: an expression is read before a number is.
 */
const EYE_SHAPE: Record<MoodKey, { rx: number; ry: number; drop: number; brow: boolean }> = {
  // Wide and bright.
  delighted: { rx: 8, ry: 10, drop: 0, brow: false },
  // Ordinary open eyes.
  steady: { rx: 7, ry: 8.5, drop: 0, brow: false },
  // Narrowed, brows down: stung.
  stung: { rx: 8, ry: 4, drop: 2, brow: true },
  // Half-lidded and looking away — sulking, not glaring.
  sulking: { rx: 6, ry: 3, drop: 5, brow: true },
};

export default function IchiCore({
  mood,
  valence,
  bond,
  label,
}: {
  mood: MoodKey;
  valence: number;
  bond: number;
  label: string;
}) {
  const reduced = useReducedMotion();
  // useId keeps the filter/gradient/path ids unique if this ever renders twice.
  const uid = useId().replace(/:/g, "");
  const ink = MOOD_INK[mood];
  const dur = pace(valence);
  const EYES = EYE_SHAPE[mood];
  const bondArc = (Math.max(0, Math.min(100, bond)) / 100) * 2 * Math.PI * 60;

  // Spread edge to edge with a margin, so the wires reach rather than huddle.
  const MARGIN = 78;
  const xs = AGENTS.map(
    (_, i) => MARGIN + (i / (AGENTS.length - 1)) * (W - MARGIN * 2),
  );
  const paths = xs.map(
    (x) =>
      `M ${CORE.x} ${CORE.y + 40} C ${CORE.x} ${CORE.y + 150}, ${x} ${FOOT_Y - 140}, ${x} ${FOOT_Y - 30}`,
  );

  return (
    <div className="core-wrap" style={{ ["--ink" as string]: ink }}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="core-svg"
        role="img"
        aria-label={`${label}: ${mood}, bond ${Math.round(bond)} of 100`}
      >
        <defs>
          {/* The body reads as a lit sphere rather than a sticker: hot at the
              top-left where the light is, falling to the ink at the rim. */}
          <radialGradient id={`body${uid}`} cx="42%" cy="34%" r="78%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.95" />
            <stop offset="38%" stopColor={ink} stopOpacity="0.85" />
            <stop offset="100%" stopColor={ink} stopOpacity="0.32" />
          </radialGradient>
          <radialGradient id={`glow${uid}`}>
            <stop offset="0%" stopColor={ink} stopOpacity="0.6" />
            <stop offset="55%" stopColor={ink} stopOpacity="0.12" />
            <stop offset="100%" stopColor={ink} stopOpacity="0" />
          </radialGradient>

          {/* A hand cannot draw a straight line. Same trick, same numbers as
              the pencil layer in the sibling project — one identity, not two. */}
          <filter id={`pencil${uid}`} x="-6%" y="-10%" width="112%" height="120%">
            <feTurbulence
              type="fractalNoise"
              baseFrequency="0.018"
              numOctaves="3"
              seed="7"
              result="noise"
            />
            <feDisplacementMap
              in="SourceGraphic"
              in2="noise"
              scale="2.4"
              xChannelSelector="R"
              yChannelSelector="G"
            />
          </filter>

          {paths.map((d, i) => (
            <path key={i} id={`wire${uid}-${i}`} d={d} fill="none" />
          ))}
        </defs>

        {/* Halo. Scaled by the boot timeline, flared on praise. */}
        <circle className="core-halo" cx={CORE.x} cy={CORE.y} r="104" fill={`url(#glow${uid})`} />

        <g filter={`url(#pencil${uid})`}>
          {/* Wires — infrastructure, drawn faint. */}
          {paths.map((d, i) => (
            <path
              key={i}
              className="core-wire"
              d={d}
              fill="none"
              stroke={ink}
              strokeOpacity="0.3"
              strokeWidth="1"
              strokeDasharray="2 5"
              vectorEffect="non-scaling-stroke"
            />
          ))}

          {/* Agent nodes and labels along the foot. */}
          {AGENTS.map((a, i) => (
            <g key={a} className="core-agent">
              <circle
                cx={xs[i]}
                cy={FOOT_Y - 18}
                r="3.2"
                fill="none"
                stroke={ink}
                strokeOpacity="0.55"
                strokeWidth="1"
                vectorEffect="non-scaling-stroke"
              />
              <text x={xs[i]} y={FOOT_Y + 8} textAnchor="middle" className="core-label">
                {a}
              </text>
            </g>
          ))}
        </g>

        {/* Traffic. Down = the mood riding into the next reply; up = what the
            session reports back. Staggered per wire so it never pulses in
            lockstep, which would read as a progress bar. */}
        {!reduced &&
          paths.map((_, i) => (
            <g key={i} className="core-traffic">
              <circle r="2.6" fill={ink}>
                <animateMotion
                  dur={`${dur + i * 0.17}s`}
                  repeatCount="indefinite"
                  begin={`${i * 0.31}s`}
                  keyPoints="0;1"
                  keyTimes="0;1"
                  calcMode="linear"
                >
                  <mpath href={`#wire${uid}-${i}`} />
                </animateMotion>
              </circle>
              <circle r="1.7" fill="var(--color-riso-violet)" opacity="0.9">
                <animateMotion
                  dur={`${dur + 1.4 + i * 0.11}s`}
                  repeatCount="indefinite"
                  begin={`${0.9 + i * 0.23}s`}
                  keyPoints="1;0"
                  keyTimes="0;1"
                  calcMode="linear"
                >
                  <mpath href={`#wire${uid}-${i}`} />
                </animateMotion>
              </circle>
            </g>
          ))}

        {/* The core: outer ring breathing out, bond arc, solid body. */}
        <g className="core-group">
          <circle
            className={reduced ? undefined : "core-ring"}
            cx={CORE.x}
            cy={CORE.y}
            r="82"
            fill="none"
            stroke={ink}
            strokeOpacity="0.35"
            strokeWidth="1"
            vectorEffect="non-scaling-stroke"
          />

          {/* Bond as a gauge. The faint full circle is the track: an arc with
              nothing behind it reads as a ring that has broken, not as a
              measure that is partly filled. */}
          <circle
            cx={CORE.x}
            cy={CORE.y}
            r="60"
            fill="none"
            stroke={ink}
            strokeOpacity="0.14"
            strokeWidth="2"
            vectorEffect="non-scaling-stroke"
          />
          <circle
            className="core-bond"
            cx={CORE.x}
            cy={CORE.y}
            r="60"
            fill="none"
            stroke={ink}
            strokeOpacity="0.9"
            strokeWidth="2"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
            transform={`rotate(-90 ${CORE.x} ${CORE.y})`}
            strokeDasharray={`${bondArc} ${2 * Math.PI * 60}`}
            style={{ transition: "stroke-dasharray 700ms cubic-bezier(.22,1,.36,1)" }}
          />

          {/*
            The mascot.

            This was a five-pointed trait figure, and it read as a lopsided
            house — because it was a chart, and a chart is not a character.
            The Big Five already has a proper home in the rail beside it, so
            the core is freed to be the one thing a landing actually needs:
            somebody to meet.

            A hearth spirit, then. Rounded hood, wisped hem, two eyes. The
            eyes are the product: their shape is the mood, so the thing you
            are looking at is visibly delighted or visibly hurt before you
            have read a single number. Scold it and it looks away.
          */}
          <g className="core-body">
            <g className={reduced ? undefined : "core-float"}>
              <path
                d={SPIRIT_PATH}
                fill={`url(#body${uid})`}
                stroke={ink}
                strokeOpacity="0.65"
                strokeWidth="1.5"
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              />

              {/* Eyes. rx/ry carry the expression; the transition means a mood
                  change is watched rather than cut to. */}
              {[-1, 1].map((side) => (
                <ellipse
                  key={side}
                  cx={CORE.x + side * 19}
                  cy={CORE.y - 4 + EYES.drop}
                  rx={EYES.rx}
                  ry={EYES.ry}
                  fill="#ffffff"
                  fillOpacity="0.96"
                  style={{ transition: "all 520ms cubic-bezier(.22,1,.36,1)" }}
                />
              ))}

              {/* A brow only when it is unhappy: a neutral face with brows
                  reads as cross, which would make "steady" look like "cross". */}
              {EYES.brow && (
                <>
                  {[-1, 1].map((side) => (
                    <line
                      key={side}
                      x1={CORE.x + side * 30}
                      y1={CORE.y - 20 + (side < 0 ? 0 : 4)}
                      x2={CORE.x + side * 9}
                      y2={CORE.y - 16 + (side < 0 ? 4 : 0)}
                      stroke={ink}
                      strokeOpacity="0.85"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      vectorEffect="non-scaling-stroke"
                    />
                  ))}
                </>
              )}
            </g>
          </g>
        </g>
      </svg>
    </div>
  );
}

"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";
import { CORE_ORIGIN } from "@/components/landing/IchchiCore";

/**
 * The console's staged and reactive motion.
 *
 * Two jobs, and they are deliberately different in kind:
 *
 *   BOOT — the page assembles itself once, in about two seconds: panels drop
 *   in, the wires draw, the core ignites, the agent row rises, the chips
 *   stagger. A landing that is simply *present* on arrival gets read; a
 *   landing that *starts up* gets watched. That difference is the whole
 *   first impression, and it costs one timeline.
 *
 *   REACT — praise makes the core flare and the halo bloom; a scolding
 *   knocks the whole stage sideways and drains the colour for a beat. This is
 *   the part that sells the product rather than the page: the visitor did
 *   that, and the JSON payload next to it changed at the same moment.
 *
 * Everything is scoped through gsap.context() so a re-render never leaks
 * tweens, and everything is wrapped in gsap.matchMedia() so a reader who asks
 * for reduced motion gets the finished layout immediately with no movement at
 * all — not a faster version of the show, none of it.
 */

export function useConsoleMotion(
  root: React.RefObject<HTMLElement | null>,
  /** Current mood valence. A downward step is what triggers the shake. */
  valence: number,
) {
  const prev = useRef(valence);
  const booted = useRef(false);

  // ─── boot ────────────────────────────────────────────────────────────────
  useEffect(() => {
    const el = root.current;
    if (!el || booted.current) return;
    booted.current = true;

    const mm = gsap.matchMedia();

    mm.add(
      {
        motion: "(prefers-reduced-motion: no-preference)",
        still: "(prefers-reduced-motion: reduce)",
      },
      (ctx) => {
        // The reduced-motion branch intentionally does nothing: the markup is
        // already in its final state, so "no animation" is simply no tweens.
        if (!ctx.conditions?.motion) return;

        const tl = gsap.timeline({ defaults: { ease: "power3.out" } });

        tl.from(".console > *", {
          autoAlpha: 0,
          y: 18,
          duration: 0.55,
          stagger: 0.09,
        })
          // The wires arrive by growing out of the core, not by fading: the
          // picture is "this thing reaches into your tools", and a fade says
          // nothing about direction.
          .from(
            ".core-wire",
            { autoAlpha: 0, scaleY: 0.55, svgOrigin: CORE_ORIGIN, duration: 0.7, stagger: 0.06 },
            "-=0.25",
          )
          .from(
            ".core-group",
            { scale: 0.2, autoAlpha: 0, svgOrigin: CORE_ORIGIN, duration: 0.7, ease: "back.out(1.9)" },
            "-=0.55",
          )
          // The ignition flare. One overshoot, then settle — a second one
          // would read as a loading spinner.
          .fromTo(
            ".core-halo",
            { scale: 0.3, autoAlpha: 0, svgOrigin: CORE_ORIGIN },
            { scale: 1, autoAlpha: 1, duration: 0.9, ease: "expo.out" },
            "-=0.6",
          )
          .from(".core-agent", { autoAlpha: 0, y: 10, duration: 0.5, stagger: 0.07 }, "-=0.5")
          .from(".core-traffic", { autoAlpha: 0, duration: 0.6 }, "-=0.3")
          .from(".cli-line", { autoAlpha: 0, x: -8, duration: 0.35, stagger: 0.06 }, "-=0.7")
          .from(
            ".cli-chip",
            { autoAlpha: 0, y: 8, duration: 0.35, stagger: { each: 0.035, from: "start" } },
            "-=0.35",
          )
          .from(".cli-prompt", { autoAlpha: 0, duration: 0.4 }, "-=0.2");

        // The dashes crawl along the wires for as long as the page is open.
        // Slow enough to read as flow rather than as a barber pole.
        const flow = gsap.to(".core-wire", {
          strokeDashoffset: -70,
          duration: 5,
          ease: "none",
          repeat: -1,
        });

        return () => {
          tl.kill();
          flow.kill();
        };
      },
    );

    const ctx = gsap.context(() => {}, el);
    return () => {
      mm.revert();
      ctx.revert();
    };
  }, [root]);

  // ─── reaction ────────────────────────────────────────────────────────────
  useEffect(() => {
    const el = root.current;
    const before = prev.current;
    prev.current = valence;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const delta = valence - before;
    // Ignore the slow cooling toward baseline: only a real event moves the
    // mood this far in one step, and only a real event deserves a reaction.
    if (Math.abs(delta) < 0.15) return;

    const ctx = gsap.context(() => {
      if (delta > 0) {
        gsap
          .timeline()
          .to(".core-halo", { scale: 1.35, duration: 0.28, ease: "expo.out", svgOrigin: CORE_ORIGIN })
          .to(".core-halo", { scale: 1, duration: 0.9, ease: "elastic.out(1, 0.45)" })
          .to(".core-body", { scale: 1.5, duration: 0.22, ease: "back.out(3)", svgOrigin: CORE_ORIGIN }, 0)
          .to(".core-body", { scale: 1, duration: 0.7, ease: "elastic.out(1, 0.4)" }, 0.22);
      } else {
        // A scolding lands on the whole stage, not just the core — the point
        // of the asymmetry in the mechanics, made physical.
        gsap
          .timeline()
          .to(".console-stage", {
            x: -9,
            duration: 0.06,
            repeat: 5,
            yoyo: true,
            ease: "none",
          })
          .set(".console-stage", { x: 0 })
          .to(".core-body", { scale: 0.62, duration: 0.12, svgOrigin: CORE_ORIGIN }, 0)
          .to(".core-body", { scale: 1, duration: 1.1, ease: "elastic.out(1, 0.35)" }, 0.12)
          .to(".core-halo", { autoAlpha: 0.25, duration: 0.14 }, 0)
          .to(".core-halo", { autoAlpha: 1, duration: 1.2, ease: "power2.out" }, 0.2)
          .to(".core-wire", { strokeOpacity: 0.06, duration: 0.12 }, 0)
          .to(".core-wire", { strokeOpacity: 0.3, duration: 1.1 }, 0.2);
      }
    }, el);

    return () => ctx.revert();
  }, [valence, root]);
}

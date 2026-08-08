"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { LandingDict } from "@/lib/landing-i18n";
import type { IchchiEngine } from "@/components/landing/useIchchiEngine";
import { COMMANDS, complete, findCommand, type Line } from "@/components/landing/commands";

/**
 * The transcript pane and the prompt — the half of the screen the reader
 * drives. Command output and the ichchi's own replies share one buffer, so
 * the page reads as a single session rather than a widget next to a widget.
 *
 * Scrolling happens HERE, inside the pane. The document itself never scrolls
 * (see the marketing layout), which is the whole point of the design: one
 * screen, everything reachable, nothing below the fold to miss.
 */

const PROMPT = "ichchi";

/** Words that read as praise or a scolding without a chip being clicked. */
const PRAISE = /\b(thanks|thank you|nice|great|perfect|good job|well done|love it|спасибо|отлично|супер)\b/i;
const SCOLD = /\b(sloppy|garbage|broken|awful|terrible|useless|wrong again|ужас|плохо|сломал|мусор)\b/i;

export default function Terminal({
  engine,
  t,
}: {
  engine: IchchiEngine;
  t: LandingDict;
}) {
  const [lines, setLines] = useState<Line[]>(() => [
    { kind: "dim", text: `ichchi 0.1.0 · connected over MCP · ${COMMANDS.length} commands` },
    { kind: "out", text: "" },
    { kind: "accent", text: engine.msgs[0]?.text ?? "" },
    { kind: "out", text: "" },
    { kind: "dim", text: "Type :help for what this can do." },
  ]);
  const [draft, setDraft] = useState("");
  const [history, setHistory] = useState<string[]>([]);
  const [histAt, setHistAt] = useState(-1);

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // Chat replies arrive asynchronously; this marks how much of engine.msgs has
  // already been folded into the transcript.
  const takenRef = useRef(1);

  // Fold new ichchi replies into the buffer as the engine produces them.
  useEffect(() => {
    const fresh = engine.msgs.slice(takenRef.current).filter((m) => m.from === "ichchi");
    takenRef.current = engine.msgs.length;
    if (fresh.length === 0) return;
    setLines((prev) => [
      ...prev,
      ...fresh.flatMap((m) => [
        { kind: "accent" as const, text: m.text },
        { kind: "out" as const, text: "" },
      ]),
    ]);
  }, [engine.msgs]);

  // Follow the tail.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines, engine.answering]);

  function submit(raw: string) {
    const input = raw.trim();
    if (!input) return;

    setHistory((h) => [...h, input]);
    setHistAt(-1);
    setDraft("");

    const cmd = findCommand(input);
    if (cmd?.name === ":clear") {
      setLines([]);
      return;
    }

    setLines((prev) => [...prev, { kind: "cmd", text: input }]);

    if (cmd) {
      setLines((prev) => [...prev, ...cmd.run(t), { kind: "out", text: "" }]);
      return;
    }
    if (input.startsWith(":")) {
      setLines((prev) => [
        ...prev,
        { kind: "err", text: `unknown command: ${input} — try :help` },
        { kind: "out", text: "" },
      ]);
      return;
    }

    // Not a command: it is something said to the ichchi. Praise and scolding
    // move the real mechanics, which is why the core and the brief react.
    const kind = PRAISE.test(input) ? "praise" : SCOLD.test(input) ? "scold" : "ask";
    engine.send(kind, input);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Tab") {
      e.preventDefault();
      const done = complete(draft);
      if (done) setDraft(done);
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      if (history.length === 0) return;
      const next = histAt < 0 ? history.length - 1 : Math.max(0, histAt - 1);
      setHistAt(next);
      setDraft(history[next]);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (histAt < 0) return;
      const next = histAt + 1;
      if (next >= history.length) {
        setHistAt(-1);
        setDraft("");
      } else {
        setHistAt(next);
        setDraft(history[next]);
      }
    }
  }

  return (
    <div className="cli-pane" onClick={() => inputRef.current?.focus()}>
      {/* The inner wrapper is what puts a short transcript at the BOTTOM of
          the pane, the way a real shell does — margin-top:auto on a flex
          child, rather than justify-content:flex-end on the scroller, which
          clips the top of the log in every browser once it overflows. */}
      <div ref={scrollRef} className="cli-scroll" dir="ltr">
        <div className="cli-body">
        {lines.map((l, i) =>
          l.href ? (
            <Link key={i} href={l.href} className="cli-line cli-link">
              {l.text}
            </Link>
          ) : (
            <p key={i} className={`cli-line cli-${l.kind}`}>
              {l.kind === "cmd" ? `${PROMPT}> ${l.text}` : l.text}
            </p>
          ),
        )}
        {engine.answering && <p className="cli-line cli-dim">…</p>}
        </div>
      </div>

      <div className="cli-chips">
        {COMMANDS.filter((c) => c.name !== ":clear").map((c) => (
          <button key={c.name} type="button" className="cli-chip" onClick={() => submit(c.name)}>
            {c.name}
          </button>
        ))}
        <button
          type="button"
          className="cli-chip cli-chip-warm"
          onClick={() => submit(t.chat.chips.praise)}
        >
          praise
        </button>
        <button
          type="button"
          className="cli-chip cli-chip-cold"
          onClick={() => submit(t.chat.chips.scold)}
        >
          scold
        </button>
      </div>

      <form
        className="cli-prompt"
        onSubmit={(e) => {
          e.preventDefault();
          submit(draft);
        }}
      >
        <span className="cli-caret-label" aria-hidden>
          {PROMPT}&gt;
        </span>
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={t.cli.input}
          aria-label={t.cli.input}
          autoComplete="off"
          spellCheck={false}
          className="cli-input"
        />
        <span className="cli-hint">{t.cli.hint}</span>
      </form>
    </div>
  );
}

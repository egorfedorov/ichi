"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { LandingDict } from "@/lib/landing-i18n";
import type { IchiEngine } from "@/components/landing/useIchiEngine";
import { COMMANDS, complete, findCommand, type Line } from "@/components/landing/commands";
import { TOOLS } from "@/lib/mcp-tools";
import { LOCALES, LOCALE_COOKIE } from "@/lib/locales";
import { useReducedMotion } from "@/components/landing/useReducedMotion";
import {
  advance,
  beginSignIn,
  EMPTY_SESSION,
  listMine,
  listTokens,
  mintToken,
  revokeToken,
  setupBoard,
  whoami,
  type SessionState,
} from "@/components/landing/session-commands";

/**
 * The transcript pane and the prompt — the half of the screen the reader
 * drives. Command output and the ichi's own replies share one buffer, so
 * the page reads as a single session rather than a widget next to a widget.
 *
 * Scrolling happens HERE, inside the pane. The document itself never scrolls
 * (see the marketing layout), which is the whole point of the design: one
 * screen, everything reachable, nothing below the fold to miss.
 */

const PROMPT = "ichi";
const TOOL_COUNT = TOOLS.length;

/**
 * Choose a language and reload.
 *
 * Module scope on purpose: writing to document.cookie from inside a component
 * body is exactly the kind of external mutation the React compiler refuses,
 * and it is right to — this is an effect on the document, not render logic.
 * The dictionary is picked on the server from this cookie, so the reload is
 * the honest implementation rather than a shortcut.
 */
function chooseLocale(code: string): void {
  document.cookie = `${LOCALE_COOKIE}=${code}; Path=/; Max-Age=31536000; SameSite=Lax`;
  setTimeout(() => location.reload(), 260);
}

/** Words that read as praise or a scolding without a chip being clicked. */
const PRAISE = /\b(thanks|thank you|nice|great|perfect|good job|well done|love it|спасибо|отлично|супер)\b/i;
const SCOLD = /\b(sloppy|garbage|broken|awful|terrible|useless|wrong again|ужас|плохо|сломал|мусор)\b/i;

export default function Terminal({
  engine,
  t,
  greeting,
  name,
  onName,
}: {
  engine: IchiEngine;
  t: LandingDict;
  /** null until the visitor memory has been read; the boot waits for it. */
  greeting: string | null;
  /** What this visitor chose to call it, if anything. */
  name: string | null;
  onName: (chosen: string) => void;
}) {
  const [lines, setLines] = useState<Line[]>([]);
  const [typing, setTyping] = useState<Line | null>(null);
  const [draft, setDraft] = useState("");
  const [history, setHistory] = useState<string[]>([]);
  const [histAt, setHistAt] = useState(-1);
  const [session, setSession] = useState<SessionState>(EMPTY_SESSION);
  const reduced = useReducedMotion();
  const booted = useRef(false);
  // Captured once so the boot script cannot change shape mid-type.
  const greetingName = name;

  // Ask the server once who this is, so a returning visitor with a live
  // cookie sees "signed in as …" instead of being asked to sign in again.
  useEffect(() => {
    let alive = true;
    void whoami().then((email) => {
      if (alive && email) setSession((s) => ({ ...s, email }));
    });
    return () => {
      alive = false;
    };
  }, []);

  /**
   * The boot. Types itself out, because a console that is simply *there* on
   * arrival is a screenshot, and one that starts up is a machine. Waits for
   * the visitor memory so a returning reader is greeted by name-of-absence
   * rather than by the stock line.
   *
   * Reduced-motion readers get the finished transcript instantly — the
   * information is identical, only the theatre is skipped.
   */
  useEffect(() => {
    if (!greeting || booted.current) return;
    booted.current = true;

    const script: Line[] = [
      { kind: "dim", text: `ichi 0.1.0 · ${COMMANDS.length} commands` },
      { kind: "dim", text: "connecting over MCP …" },
      { kind: "head", text: `handshake ok · ${TOOL_COUNT} tools · session live` },
      { kind: "out", text: "" },
      { kind: "accent", text: greeting },
      { kind: "out", text: "" },
      {
        kind: "dim",
        text: greetingName
          ? "Type :help, or say something to it."
          : "Type :setup to get connected, :help for everything else.",
      },
    ];

    let cancelled = false;
    const timers: ReturnType<typeof setTimeout>[] = [];

    if (reduced) {
      // Still scheduled rather than set inline: a synchronous setState in an
      // effect body cascades a second render before paint, and the reduced
      // path should be cheaper than the animated one, not more expensive.
      timers.push(setTimeout(() => !cancelled && setLines(script), 0));
      return () => {
        cancelled = true;
        timers.forEach(clearTimeout);
      };
    }

    const typeLine = (index: number) => {
      if (cancelled || index >= script.length) {
        setTyping(null);
        return;
      }
      const line = script[index];
      // Blank lines and the two status lines land whole; only the sentences
      // are worth watching appear.
      const instant = line.text.length === 0 || line.kind === "dim";
      if (instant) {
        setLines((prev) => [...prev, line]);
        timers.push(setTimeout(() => typeLine(index + 1), line.text ? 220 : 60));
        return;
      }

      let n = 0;
      const step = () => {
        if (cancelled) return;
        n += 2;
        setTyping({ ...line, text: line.text.slice(0, n) });
        if (n < line.text.length) {
          timers.push(setTimeout(step, 16));
        } else {
          setTyping(null);
          setLines((prev) => [...prev, line]);
          timers.push(setTimeout(() => typeLine(index + 1), 260));
        }
      };
      step();
    };

    timers.push(setTimeout(() => typeLine(0), 260));
    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
    };
  }, [greeting, greetingName, reduced]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // Chat replies arrive asynchronously; this marks how much of engine.msgs has
  // already been folded into the transcript.
  const takenRef = useRef(1);

  // Fold new ichi replies into the buffer as the engine produces them.
  useEffect(() => {
    const fresh = engine.msgs.slice(takenRef.current).filter((m) => m.from === "ichi");
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
  }, [lines, typing, engine.answering]);

  function submit(raw: string) {
    const input = raw.trim();
    if (!input) return;

    // A password must never reach the history buffer or the transcript.
    const secret = session.awaiting === "password";
    if (!secret) {
      setHistory((h) => [...h, input]);
      setHistAt(-1);
    }
    setDraft("");

    // Mid-flow: this answer belongs to the prompt, not to the command parser.
    if (session.awaiting) {
      setLines((prev) => [
        ...prev,
        { kind: "cmd", text: secret ? "•".repeat(Math.min(raw.length, 12)) : input },
      ]);
      void advance(session, raw).then((r) => {
        setSession(r.session);
        setLines((prev) => [...prev, ...r.lines, { kind: "out", text: "" }]);
      });
      return;
    }

    const cmd = findCommand(input);
    if (cmd?.name === ":clear") {
      setLines([]);
      return;
    }

    setLines((prev) => [...prev, { kind: "cmd", text: input }]);

    // Session commands are handled here rather than in the registry: they
    // hold state and talk to the server, and commands.ts is deliberately pure
    // so the SEO twin can render every command's output on the server.
    if (input === ":signin" || input === ":signup") {
      const r = beginSignIn(input === ":signup" ? "up" : "in");
      setSession(r.session);
      setLines((prev) => [...prev, ...r.lines]);
      return;
    }
    // Language. The picker lived in the bar that is gone, so it is a command
    // now — and a bare `:lang` lists what is on offer rather than guessing.
    if (input === ":lang" || input.startsWith(":lang ")) {
      const code = input.slice(5).trim();
      const hit = LOCALES.find((l) => l.code.toLowerCase() === code.toLowerCase());
      if (!code) {
        setLines((prev) => [
          ...prev,
          { kind: "head", text: "LANGUAGES" },
          ...LOCALES.map((l) => ({
            kind: "out" as const,
            text: `  :lang ${l.code.padEnd(8)} ${l.native}`,
          })),
          { kind: "out", text: "" },
        ]);
        return;
      }
      if (!hit) {
        setLines((prev) => [
          ...prev,
          { kind: "err", text: `no such language: ${code} — :lang lists them` },
          { kind: "out", text: "" },
        ]);
        return;
      }
      setLines((prev) => [...prev, { kind: "accent", text: `→ ${hit.native}` }]);
      chooseLocale(hit.code);
      return;
    }
    /*
     * Naming.
     *
     * The product has always taken a name — ichi_adopt has a `name` argument
     * and the row carries it. What was missing was anyone finding that out:
     * the demo introduced an anonymous thing, and an anonymous thing is a
     * widget. Giving it a name is the moment it stops being one, so the
     * landing hands the visitor that moment before asking them for anything.
     */
    if (input === ":name" || input.startsWith(":name ")) {
      const chosen = input.slice(5).trim().slice(0, 24);
      if (!chosen) {
        setLines((prev) => [
          ...prev,
          {
            kind: "dim",
            text: name
              ? `You called it ${name}. :name <something else> to change that.`
              : "What do you want to call it? :name Мурзик",
          },
          { kind: "out", text: "" },
        ]);
        return;
      }
      onName(chosen);
      setLines((prev) => [
        ...prev,
        { kind: "accent", text: `${chosen}. I'll answer to that.` },
        {
          kind: "dim",
          text: "  Your agent does the same with ichi_adopt — the name is yours to pick.",
        },
        { kind: "out", text: "" },
      ]);
      return;
    }
    if (input === ":whoami") {
      setLines((prev) => [
        ...prev,
        session.email
          ? { kind: "accent", text: session.email }
          : { kind: "dim", text: "not signed in — :signin" },
        { kind: "out", text: "" },
      ]);
      return;
    }
    const serverCmd: Record<string, () => Promise<{ lines: Line[] }>> = {
      ":token": () => mintToken(session),
      ":mine": () => listMine(session),
      ":tokens": () => listTokens(session),
      ":setup": () => setupBoard(session, name),
    };
    if (serverCmd[input]) {
      void serverCmd[input]().then((r) => {
        setLines((prev) => [...prev, ...r.lines, { kind: "out", text: "" }]);
      });
      return;
    }
    if (input.startsWith(":revoke")) {
      void revokeToken(session, input.slice(7).trim()).then((r) => {
        setLines((prev) => [...prev, ...r.lines, { kind: "out", text: "" }]);
      });
      return;
    }

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

    // Not a command: it is something said to the ichi. Praise and scolding
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
              {l.kind === "cmd" ? `${(name ?? PROMPT).toLowerCase()}> ${l.text}` : l.text}
            </p>
          ),
        )}
        {typing && (
          <p className={`cli-line cli-${typing.kind}`}>
            {typing.text}
            <span className="caret" aria-hidden />
          </p>
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
        {[":setup", ":name", session.email ? ":mine" : ":signin", ":token", ":lang"].map((n) => (
          <button key={n} type="button" className="cli-chip" onClick={() => submit(n)}>
            {n}
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
          {session.awaiting === "email"
            ? "email>"
            : session.awaiting === "password"
              ? "password>"
              : `${(name ?? PROMPT).toLowerCase()}>`}
        </span>
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          // A real password field, not a styled text input: password managers
          // and the browser's own protections key off the type attribute.
          type={session.awaiting === "password" ? "password" : "text"}
          autoComplete={
            session.awaiting === "password"
              ? "current-password"
              : session.awaiting === "email"
                ? "email"
                : "off"
          }
          placeholder={session.awaiting ? "" : t.cli.input}
          aria-label={session.awaiting ?? t.cli.input}
          spellCheck={false}
          className="cli-input"
        />
        <span className="cli-hint">{t.cli.hint}</span>
      </form>
    </div>
  );
}

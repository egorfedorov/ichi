import Link from "next/link";
import { ARCHETYPES } from "@/lib/ichchi";
import { TOOLS } from "@/lib/mcp-tools";
import { landingDict } from "@/lib/t";
import Console from "@/components/landing/Console";

// The page reads the language cookie, so it renders per request.
export const dynamic = "force-dynamic";

/**
 * The landing is a console: one viewport, no document scroll, everything the
 * old five-section page carried reachable as a command (see commands.ts).
 *
 * Two things are deliberately still here as plain HTML below the console:
 *
 *   1. The copy a crawler and a screen reader need. Content that only exists
 *      after a click is content that does not exist to Google, and a landing
 *      that ranks for nothing is a landing nobody reads. It is visually
 *      hidden, not display:none — hidden text is still read aloud and still
 *      indexed, which is exactly the trade we want.
 *   2. A real escape hatch. `overflow:hidden` on a viewport-height page is
 *      hostile to anyone zoomed in or on a short window, so the console only
 *      claims the viewport when there is room for it (see .console in
 *      globals.css); below that it grows and the page scrolls like any other.
 */
export default async function Home() {
  const t = await landingDict();

  return (
    <>
      <Console t={t} />

      {/* ── The same page, in text. For crawlers, screen readers, and anyone
             whose JavaScript did not run. ──────────────────────────────── */}
      <div className="sr-page">
        <h1>{t.hero.title}</h1>
        <p>{t.hero.sub}</p>
        <p>
          <Link href="/">{t.hero.ctaPrimary}</Link>
        </p>

        <h2>{t.flow.title}</h2>
        <p>{t.flow.sub}</p>
        <ol>
          {t.flow.steps.map((s) => (
            <li key={s.t}>
              <strong>{s.t}</strong> — {s.d}
            </li>
          ))}
        </ol>

        <h2>{t.mech.title}</h2>
        <p>{t.mech.sub}</p>
        <ul>
          {t.mech.cards.map((c) => (
            <li key={c.t}>
              <strong>{c.t}</strong> — {c.d}
            </li>
          ))}
        </ul>

        <h2>{t.ichchi.title}</h2>
        <p>{t.ichchi.sub}</p>
        <ul>
          {ARCHETYPES.map((a) => {
            const copy = t.ichchi.items[a.id as keyof typeof t.ichchi.items];
            return (
              <li key={a.id}>
                <strong>{a.name}</strong> ({a.id}) — {copy?.desc ?? a.description}
              </li>
            );
          })}
        </ul>

        <h2>MCP tools</h2>
        <ul>
          {TOOLS.map((tool) => (
            <li key={tool.name}>
              <strong>{tool.name}</strong> — {tool.description}
            </li>
          ))}
        </ul>

        <h2>{t.connect.title}</h2>
        <ol>
          {t.connect.steps.map((s) => (
            <li key={s.t}>
              <strong>{s.t}</strong> — {s.d}
            </li>
          ))}
        </ol>

        <h2>{t.why.title}</h2>
        <p>{t.why.body}</p>
        <p>{t.why.etym}</p>
      </div>
    </>
  );
}

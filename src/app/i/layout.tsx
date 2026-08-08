import Link from "next/link";
import { currentLocale, landingDict } from "@/lib/t";
import { localeOf } from "@/lib/locales";

/**
 * Public ichchi pages wear the paper chrome, not the app's night theme.
 *
 * This is the one page a stranger reaches first, arriving from someone else's
 * link with no idea what any of it is — so unlike the console, it keeps a
 * wordmark and a way in. A signed-out visitor landing on a bare page with no
 * exit reads it as a dead end.
 */
export default async function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const locale = await currentLocale();
  const t = await landingDict();
  const rtl = localeOf(locale).rtl;

  return (
    <div dir={rtl ? "rtl" : "ltr"} className="flex min-h-screen flex-col">
      <header className="topbar">
        <div className="shell topbar-inner">
          <Link href="/" className="wordmark">
            ichchi<span>.</span>
          </Link>
          <Link className="btn ms-auto" href="/">
            {t.hero.ctaPrimary}
          </Link>
        </div>
      </header>

      <div className="flex-1">{children}</div>

      <footer className="border-t border-rule-paper">
        <div className="shell py-6">
          <p className="mono text-xs text-ink-2">{t.footer.line}</p>
        </div>
      </footer>
    </div>
  );
}

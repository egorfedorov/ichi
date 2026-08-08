import Link from "next/link";
import { currentLocale, landingDict } from "@/lib/t";
import { localeOf } from "@/lib/locales";
import TopBar from "@/components/landing/TopBar";

/**
 * Public ichchi pages wear the paper chrome, not the app's night theme.
 *
 * This is the one page a stranger reaches first, arriving from someone else's
 * link with no idea what any of it is. So it carries the marketing bar and a
 * way in — a signed-out visitor landing on a dark internal dashboard would
 * read it as an app they are locked out of, rather than an invitation.
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
      <TopBar locale={locale} t={t.nav} />
      <div className="flex-1">{children}</div>
      <footer className="border-t border-rule-paper">
        <div className="shell flex flex-wrap items-center gap-x-6 gap-y-2 py-6">
          <p className="mono text-xs text-ink-2">{t.footer.line}</p>
          <Link className="navlink ms-auto" href="/">
            {t.hero.ctaPrimary}
          </Link>
        </div>
      </footer>
    </div>
  );
}

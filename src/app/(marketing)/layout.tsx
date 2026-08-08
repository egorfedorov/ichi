import { currentLocale, landingDict } from "@/lib/t";
import { localeOf } from "@/lib/locales";
import TopBar from "@/components/landing/TopBar";

/**
 * The public side: paper TopBar, then the console, and nothing else. dir is
 * set here so the RTL locales flip the whole page, terminal included.
 *
 * There is no footer. The console is sized to the viewport minus this bar, so
 * anything after it would put the page into scroll and break the one promise
 * the design makes. The footer's three links already live in the bar above —
 * a footer here would have been duplication that costs the whole layout.
 *
 * Note that nothing sets `overflow: hidden`. The page does not scroll because
 * nothing overflows, which keeps the scrollbar available the moment the
 * console gives up the viewport (short window, zoomed-in reader) instead of
 * trapping them.
 */
export default async function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const locale = await currentLocale();
  const t = await landingDict();
  const rtl = localeOf(locale).rtl;

  return (
    <div dir={rtl ? "rtl" : "ltr"}>
      <TopBar locale={locale} t={t.nav} />
      {children}
    </div>
  );
}

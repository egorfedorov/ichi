import { currentLocale } from "@/lib/t";
import { localeOf } from "@/lib/locales";

/**
 * The console owns the viewport. Nothing else is on the page.
 *
 * There is no bar, no footer, no nav. Everything a bar would have offered is
 * a command inside the terminal — :signin, :token, :connect, :lang — and a
 * chrome strip above a console that can already do all of it would only be
 * announcing that the console cannot be trusted with it.
 *
 * The one thing this costs is the browser's own affordance for "where am I",
 * so the console's first line says the version and the connection instead.
 */
export default async function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const locale = await currentLocale();
  const rtl = localeOf(locale).rtl;

  return <div dir={rtl ? "rtl" : "ltr"}>{children}</div>;
}

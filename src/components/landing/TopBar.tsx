import Link from "next/link";
import type { LandingDict } from "@/lib/landing-i18n";
import LanguagePicker from "@/components/landing/LanguagePicker";

/**
 * The marketing bar: wordmark, the two reading destinations, the language
 * picker, and the way in. Internal pages keep their own dark SiteHeader —
 * this one is paper.
 */
export default function TopBar({
  locale,
  t,
}: {
  locale: string;
  t: LandingDict["nav"];
}) {
  return (
    <header className="topbar">
      <div className="shell topbar-inner">
        <Link href="/" className="wordmark">
          ichchi<span>.</span>
        </Link>
        <nav className="hide-sm flex items-center gap-5">
          <Link className="navlink" href="/ichchi">
            {t.ichchi}
          </Link>
          <Link className="navlink" href="/connect">
            {t.connect}
          </Link>
        </nav>
        <LanguagePicker current={locale} />
        <Link className="btn" href="/sign-in">
          {t.signIn}
        </Link>
      </div>
    </header>
  );
}

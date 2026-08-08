import Link from "next/link";
import { currentUser } from "@/lib/session";
import SignOutButton from "./SignOutButton";

/**
 * One header for the whole app: wordmark, the three working pages, and the
 * session state. Reading headers() here makes every page dynamic — acceptable
 * for an app whose private pages all are.
 */
export default async function SiteHeader() {
  const user = await currentUser();

  return (
    <header className="border-b border-rule">
      <div className="mx-auto flex max-w-4xl items-center gap-6 px-6 py-4">
        <Link
          href="/"
          className="text-sm font-semibold tracking-[0.3em] text-aurora uppercase"
        >
          ичи
        </Link>

        {/* Connection, tokens and sign-in all live in the console now, so
            this bar carries only the way back to it and the way out. */}
        <nav className="flex items-center gap-5 text-sm text-snow-2">
          <Link href="/ichi" className="transition-colors hover:text-snow">
            Ичи
          </Link>
          <Link href="/" className="transition-colors hover:text-snow">
            Консоль
          </Link>
        </nav>

        <span className="ml-auto flex items-center gap-4">
          {user ? (
            <>
              <span className="hidden text-xs text-snow-3 sm:inline">
                {user.email}
              </span>
              <SignOutButton />
            </>
          ) : (
            <Link
              href="/"
              className="rounded-lg border border-rule bg-night-2 px-4 py-1.5 text-sm transition-colors hover:border-aurora"
            >
              Войти
            </Link>
          )}
        </span>
      </div>
    </header>
  );
}

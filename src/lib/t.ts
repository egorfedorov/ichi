import { cookies, headers } from "next/headers";
import {
  DEFAULT_LOCALE,
  LOCALE_COOKIE,
  fromAcceptLanguage,
  isLocale,
} from "@/lib/locales";
import { LANDING, type LandingDict } from "@/lib/landing-i18n";

/**
 * Server-side translation for the landing.
 *
 * Unlike mozg's hash-of-English lookup, the landing is one page with a fixed
 * set of strings, so the dictionary is a typed object: English is the source
 * of truth and the type, every other locale must provide the same shape or
 * fail to compile. A missing translation is a build error, not a runtime
 * fallback.
 */

/**
 * The reader's language: what they picked, else what their browser asked
 * for. Cookie first — a reader who chose a language meant it, and the header
 * quietly overriding that choice on the next visit is the single most
 * irritating thing a multilingual site can do.
 */
export async function currentLocale(): Promise<string> {
  const chosen = (await cookies()).get(LOCALE_COOKIE)?.value;
  if (isLocale(chosen)) return chosen;
  return fromAcceptLanguage((await headers()).get("accept-language"));
}

/** The landing dictionary for the current reader. English by default. */
export async function landingDict(): Promise<LandingDict> {
  const locale = await currentLocale();
  return LANDING[locale] ?? LANDING[DEFAULT_LOCALE];
}

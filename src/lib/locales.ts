/**
 * The languages the landing is offered in.
 *
 * The public page only. Ichchi, settings and the connect flow stay in their
 * own language — an ichchi's memory and voice are content, and content does not
 * get translated behind the reader's back.
 */

export interface Locale {
  code: string;
  /** What speakers of it call it — never the English name. */
  native: string;
  /** Right-to-left scripts need dir on the wrapper, not just a font. */
  rtl?: boolean;
}

export const LOCALES: Locale[] = [
  { code: "en", native: "English" },
  { code: "ru", native: "Русский" },
  { code: "ar", native: "العربية", rtl: true },
  { code: "zh-Hans", native: "简体中文" },
  { code: "zh-Hant", native: "繁體中文" },
  { code: "fr", native: "Français" },
  { code: "hi", native: "हिन्दी" },
  { code: "ja", native: "日本語" },
  { code: "pt", native: "Português" },
  { code: "es", native: "Español" },
  { code: "th", native: "ไทย" },
  { code: "ur", native: "اردو", rtl: true },
];

export const DEFAULT_LOCALE = "en";

/** The cookie the picker sets. Read on every render of the landing. */
export const LOCALE_COOKIE = "ichchi_lang";

export function isLocale(code: string | undefined | null): code is string {
  return Boolean(code) && LOCALES.some((l) => l.code === code);
}

export function localeOf(code: string | undefined | null): Locale {
  return LOCALES.find((l) => l.code === code) ?? LOCALES[0];
}

/**
 * Pick a language from an Accept-Language header. Deliberately crude: match
 * the full tag, then the primary subtag, in the order the browser asked for.
 * Chinese needs the one bit of care — zh-TW/HK/MO are Traditional, the rest
 * Simplified.
 */
export function fromAcceptLanguage(header: string | null): string {
  if (!header) return DEFAULT_LOCALE;

  const asked = header
    .split(",")
    .map((part) => {
      const [tag, q] = part.trim().split(";q=");
      return { tag: tag.trim().toLowerCase(), q: q ? Number(q) : 1 };
    })
    .filter((a) => a.tag)
    .sort((a, b) => b.q - a.q);

  for (const { tag } of asked) {
    if (tag.startsWith("zh")) {
      return /(tw|hk|mo|hant)/.test(tag) ? "zh-Hant" : "zh-Hans";
    }
    const exact = LOCALES.find((l) => l.code.toLowerCase() === tag);
    if (exact) return exact.code;
    const primary = tag.split("-")[0];
    const loose = LOCALES.find((l) => l.code.toLowerCase() === primary);
    if (loose) return loose.code;
  }
  return DEFAULT_LOCALE;
}

/** A year: the choice has to survive the visit and the next one. */
const LOCALE_MAX_AGE = 60 * 60 * 24 * 365;

/**
 * Browser-side write, in a module rather than in the component — a cookie is
 * not React state, and writing one from inside a component body is what the
 * lint rule is there to catch.
 */
export function writeLocale(code: string): void {
  document.cookie =
    `${LOCALE_COOKIE}=${code}; Path=/; Max-Age=${LOCALE_MAX_AGE}; SameSite=Lax` +
    (location.protocol === "https:" ? "; Secure" : "");
}

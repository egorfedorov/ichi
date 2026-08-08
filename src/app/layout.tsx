import type { Metadata } from "next";
import { env } from "@/lib/env";
import { currentLocale } from "@/lib/t";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(env.NEXT_PUBLIC_APP_URL),
  title: "ichi — a living spirit for your agents",
  description:
    "Summon an ichi — a spirit that lives next to your AI agent over MCP. " +
    "It remembers, takes offence, grows attached, and its mood shapes the " +
    "agent's voice on every reply.",
};

/**
 * Chrome lives in the route groups: (marketing) gets the light paper TopBar,
 * (app) keeps the dark header/footer the internal pages were designed for.
 * The body is light paper — the app group re-wraps itself in night.
 */
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await currentLocale();
  return (
    <html lang={locale} dir={locale === "ar" || locale === "ur" ? "rtl" : "ltr"}>
      <body className="antialiased">{children}</body>
    </html>
  );
}

"use client";

import { useState } from "react";

/**
 * Publish an ichchi and get a link worth sending.
 *
 * Deliberately shows the URL the moment it exists, with a copy button next to
 * it: the feature is the share, and a toggle that only flips a flag leaves the
 * user hunting for what it actually did.
 *
 * The line about what strangers can see is not fine print. Someone deciding
 * whether to publish a thing that has been reading their codebase for weeks
 * needs the answer at the moment of the decision, not on a policy page.
 */
export default function PublishToggle({
  slug,
  initialPublicSlug,
  appUrl,
}: {
  slug: string;
  initialPublicSlug: string | null;
  appUrl: string;
}) {
  const [publicSlug, setPublicSlug] = useState(initialPublicSlug);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const url = publicSlug ? `${appUrl}/i/${publicSlug}` : null;

  async function toggle() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/ichchi", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, public: !publicSlug }),
      });
      if (!res.ok) throw new Error("failed");
      const data = (await res.json()) as { publicSlug: string | null };
      setPublicSlug(data.publicSlug);
    } catch {
      setError("Не получилось — попробуй ещё раз.");
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard is permission-gated; the URL is on screen either way.
      setError("Скопируй ссылку вручную.");
    }
  }

  return (
    <div className="rounded-lg border border-rule bg-night-2 p-4">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={toggle}
          disabled={busy}
          className="cursor-pointer rounded-md border border-snow-3 px-3 py-1.5 text-sm text-snow transition-colors hover:border-snow disabled:opacity-50"
        >
          {busy ? "…" : publicSlug ? "Скрыть страницу" : "Опубликовать страницу"}
        </button>

        {url && (
          <button
            type="button"
            onClick={copy}
            className="cursor-pointer font-mono text-xs text-frost underline underline-offset-4"
          >
            {copied ? "скопировано" : url}
          </button>
        )}
      </div>

      <p className="mt-3 text-xs leading-relaxed text-snow-3">
        {publicSlug
          ? "Страница открыта всем, у кого есть ссылка. Видно характер, настроение, привязанность и число воспоминаний — сами воспоминания не показываются никогда."
          : "Публичная страница показывает характер, настроение и привязанность. Содержимое воспоминаний не раскрывается — они цитируют твой проект."}
      </p>

      {error && <p className="mt-2 text-xs text-berry">{error}</p>}
    </div>
  );
}

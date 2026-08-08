"use client";

import { useState } from "react";

/**
 * Publish an ichi and get a link worth sending.
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
  initialJoinCode,
  initialMortal,
  appUrl,
}: {
  slug: string;
  initialPublicSlug: string | null;
  initialJoinCode: string | null;
  initialMortal: boolean;
  appUrl: string;
}) {
  const [publicSlug, setPublicSlug] = useState(initialPublicSlug);
  const [joinCode, setJoinCode] = useState(initialJoinCode);
  const [mortal, setMortal] = useState(initialMortal);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState<"public" | "join" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const url = publicSlug ? `${appUrl}/i/${publicSlug}` : null;
  const joinUrl = joinCode ? `${appUrl}/join/${joinCode}` : null;

  async function patch(body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/ichi", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, ...body }),
      });
      if (!res.ok) throw new Error("failed");
      return (await res.json()) as {
        publicSlug?: string | null;
        joinCode?: string | null;
        mortal?: boolean;
      };
    } catch {
      setError("Не получилось — попробуй ещё раз.");
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function togglePublic() {
    const data = await patch({ public: !publicSlug });
    if (data) setPublicSlug(data.publicSlug ?? null);
  }

  async function toggleShared() {
    const data = await patch({ shared: !joinCode });
    if (data) setJoinCode(data.joinCode ?? null);
  }

  async function toggleMortal() {
    const data = await patch({ mortal: !mortal });
    if (data) setMortal(Boolean(data.mortal));
  }

  async function copy(value: string, which: "public" | "join") {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(which);
      setTimeout(() => setCopied(null), 1600);
    } catch {
      // Clipboard is permission-gated; the URL is on screen either way.
      setError("Скопируй ссылку вручную.");
    }
  }

  return (
    <div className="space-y-3">
      {/* Publishing: read-only, for strangers. */}
      <div className="rounded-lg border border-rule bg-night-2 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={togglePublic}
            disabled={busy}
            className="cursor-pointer rounded-md border border-snow-3 px-3 py-1.5 text-sm text-snow transition-colors hover:border-snow disabled:opacity-50"
          >
            {publicSlug ? "Скрыть страницу" : "Опубликовать страницу"}
          </button>

          {url && (
            <button
              type="button"
              onClick={() => copy(url, "public")}
              className="cursor-pointer font-mono text-xs text-frost underline underline-offset-4"
            >
              {copied === "public" ? "скопировано" : url}
            </button>
          )}
        </div>

        <p className="mt-3 text-xs leading-relaxed text-snow-3">
          {publicSlug
            ? "Страница открыта всем, у кого есть ссылка. Видно характер, настроение, привязанность и число воспоминаний — сами воспоминания не показываются никогда."
            : "Публичная страница показывает характер, настроение и привязанность. Содержимое воспоминаний не раскрывается — они цитируют твой проект."}
        </p>
      </div>

      {/* Sharing: write access, for the team. A different thing entirely, so
          it gets its own box rather than a second switch in the same row. */}
      <div className="rounded-lg border border-rule bg-night-2 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={toggleShared}
            disabled={busy}
            className="cursor-pointer rounded-md border border-snow-3 px-3 py-1.5 text-sm text-snow transition-colors hover:border-snow disabled:opacity-50"
          >
            {joinCode ? "Отозвать приглашение" : "Пригласить команду"}
          </button>

          {joinUrl && (
            <button
              type="button"
              onClick={() => copy(joinUrl, "join")}
              className="cursor-pointer font-mono text-xs text-aurora underline underline-offset-4"
            >
              {copied === "join" ? "скопировано" : joinUrl}
            </button>
          )}
        </div>

        <p className="mt-3 text-xs leading-relaxed text-snow-3">
          {joinCode
            ? "У всех по ссылке появится доступ к ичи из их агентов. Стандарты станут общими для команды, а связь у ичи с каждым останется своя. Отзыв ссылки не выгоняет тех, кто уже вошёл."
            : "Общий ичи помнит стандарты команды, а не одного человека: правило, записанное однажды, приходит в сессию каждого."}
        </p>
      </div>

      {/* Mortality. Off unless asked for, and stated plainly — a setting that
          can end the thing must not read like a preference. */}
      <div className="rounded-lg border border-rule bg-night-2 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={toggleMortal}
            disabled={busy}
            className="cursor-pointer rounded-md border border-snow-3 px-3 py-1.5 text-sm text-snow transition-colors hover:border-snow disabled:opacity-50"
          >
            {mortal ? "Сделать бессмертным" : "Сделать смертным"}
          </button>
          {mortal && (
            <span className="font-mono text-xs text-ember">смертен</span>
          )}
        </div>

        <p className="mt-3 text-xs leading-relaxed text-snow-3">
          {mortal
            ? "Через 90 дней полного молчания ичи уйдёт и не вернётся. Страница, память и письма останутся — читать можно, обращаться нельзя."
            : "Ичи — хозяин места; того, кого перестают кормить, дом теряет. Включи, если хочешь, чтобы привязанность что-то значила: 90 дней тишины — и он уходит навсегда. Данные не удаляются, но вернуть его нельзя."}
        </p>
      </div>

      {error && <p className="text-xs text-berry">{error}</p>}
    </div>
  );
}

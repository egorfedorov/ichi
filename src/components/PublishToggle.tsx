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
      setError("That did not work — try again.");
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
      setError("Copy the link by hand.");
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
            {publicSlug ? "Unpublish" : "Publish a page"}
          </button>

          {url && (
            <button
              type="button"
              onClick={() => copy(url, "public")}
              className="cursor-pointer font-mono text-xs text-frost underline underline-offset-4"
            >
              {copied === "public" ? "copied" : url}
            </button>
          )}
        </div>

        <p className="mt-3 text-xs leading-relaxed text-snow-3">
          {publicSlug
            ? "Anyone with the link can read it: character, mood, attachment and how many memories. The memories themselves are never shown."
            : "A public page shows character, mood and attachment. Memory contents stay private — they quote your project."}
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
            {joinCode ? "Revoke the invitation" : "Invite your team"}
          </button>

          {joinUrl && (
            <button
              type="button"
              onClick={() => copy(joinUrl, "join")}
              className="cursor-pointer font-mono text-xs text-aurora underline underline-offset-4"
            >
              {copied === "join" ? "copied" : joinUrl}
            </button>
          )}
        </div>

        <p className="mt-3 text-xs leading-relaxed text-snow-3">
          {joinCode
            ? "Anyone with the link reaches this ichi from their own agent. Standards become the team's; the bond stays personal to each of you. Revoking the link does not evict whoever already joined."
            : "A shared ichi remembers the team's standards rather than one person's: a rule recorded once arrives in everyone's session."}
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
            {mortal ? "Make it immortal" : "Make it mortal"}
          </button>
          {mortal && (
            <span className="font-mono text-xs text-ember">mortal</span>
          )}
        </div>

        <p className="mt-3 text-xs leading-relaxed text-snow-3">
          {mortal
            ? "After 90 days of complete silence it departs and does not come back. The page, the memories and the letters remain readable; it just cannot be spoken to."
            : "An ichi owns a place, and a place stops keeping the one it stops feeding. Turn this on if you want the attachment to mean something: 90 days of silence and it leaves for good. Nothing is deleted, but it cannot be brought back."}
        </p>
      </div>

      {error && <p className="text-xs text-berry">{error}</p>}
    </div>
  );
}

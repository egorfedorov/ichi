"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Archetype } from "@/lib/ichi";

/**
 * The adopt form. Archetypes arrive from the server as props (the catalogue
 * lives in code, so there is nothing to fetch); the POST goes to the API so
 * adoptIchi runs behind session auth, same pattern as /api/tokens.
 */
export default function AdoptForm({ archetypes }: { archetypes: Archetype[] }) {
  const router = useRouter();
  const [archetypeId, setArchetypeId] = useState(archetypes[0]?.id ?? "");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const chosen = archetypes.find((a) => a.id === archetypeId);

  async function submit() {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/ichi", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ archetype: archetypeId, name }),
    });
    setBusy(false);
    if (!res.ok) {
      setError(((await res.json()) as { error?: string }).error ?? "не вышло");
      return;
    }
    const { slug } = (await res.json()) as { slug: string };
    router.push(`/ichi/${slug}`);
  }

  return (
    <div className="rounded-lg border border-rule bg-night-2 p-5">
      <h2 className="text-lg font-semibold">Призвать ичи</h2>

      <label className="mt-4 block text-xs text-snow-3">Дух</label>
      <select
        value={archetypeId}
        onChange={(e) => setArchetypeId(e.target.value)}
        className="mt-1 w-full rounded-lg border border-rule bg-night px-3 py-2 text-sm outline-none focus:border-aurora"
      >
        {archetypes.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name} — {a.tagline}
          </option>
        ))}
      </select>

      {chosen && (
        <p className="mt-2 text-xs leading-relaxed text-snow-2">
          {chosen.description}
        </p>
      )}

      <label className="mt-4 block text-xs text-snow-3">Имя</label>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="как зовут твоего духа"
        maxLength={40}
        className="mt-1 w-full rounded-lg border border-rule bg-night px-3 py-2 text-sm outline-none placeholder:text-snow-3 focus:border-aurora"
      />

      <button
        onClick={submit}
        disabled={busy || !archetypeId || name.trim().length < 2}
        className="mt-4 w-full rounded-lg bg-aurora px-4 py-2.5 text-sm font-medium text-night disabled:opacity-50"
      >
        Призвать
      </button>

      {error && <p className="mt-3 text-sm text-berry">{error}</p>}
    </div>
  );
}

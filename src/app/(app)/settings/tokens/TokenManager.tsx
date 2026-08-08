"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface TokenRow {
  id: string;
  prefix: string;
  name: string | null;
  // pg returns Date objects; the API route's JSON gives strings. Both parse.
  last_used_at: Date | string | null;
  created_at: Date | string;
}

export default function TokenManager({ tokens }: { tokens: TokenRow[] }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The plaintext exists only here, only until the next issue — the server
  // stores a hash, so after a refresh nobody can show it again.
  const [fresh, setFresh] = useState<string | null>(null);

  async function issue() {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/tokens", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: name || undefined }),
    });
    setBusy(false);
    if (!res.ok) {
      setError(((await res.json()) as { error?: string }).error ?? "failed");
      return;
    }
    const { token } = (await res.json()) as { token: string };
    setFresh(token);
    setName("");
    router.refresh();
  }

  async function revoke(id: string) {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/tokens", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id }),
    });
    setBusy(false);
    if (!res.ok) {
      setError("revoke failed");
      return;
    }
    router.refresh();
  }

  return (
    <div className="mt-8 space-y-6">
      <div className="flex gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="token name — e.g. laptop"
          className="flex-1 rounded-lg border border-rule bg-night-2 px-3 py-2 text-sm outline-none placeholder:text-snow-3 focus:border-aurora"
        />
        <button
          onClick={issue}
          disabled={busy}
          className="rounded-lg bg-aurora px-4 py-2 text-sm font-medium text-night disabled:opacity-50"
        >
          Issue token
        </button>
      </div>

      {error && <p className="text-sm text-berry">{error}</p>}

      {fresh && (
        <div className="rounded-lg border border-aurora bg-night-2 p-4">
          <p className="text-xs text-aurora">Shown once — copy it now.</p>
          <code className="mt-2 block break-all font-mono text-sm text-snow">
            {fresh}
          </code>
        </div>
      )}

      {tokens.length > 0 && (
        <ul className="divide-y divide-rule rounded-lg border border-rule">
          {tokens.map((t) => (
            <li key={t.id} className="flex items-center justify-between px-4 py-3">
              <div>
                <p className="font-mono text-sm">{t.prefix}…</p>
                <p className="text-xs text-snow-3">
                  {t.name ?? "unnamed"} ·{" "}
                  {t.last_used_at
                    ? `last used ${new Date(t.last_used_at).toISOString().slice(0, 10)}`
                    : "never used"}
                </p>
              </div>
              <button
                onClick={() => revoke(t.id)}
                disabled={busy}
                className="text-sm text-berry underline disabled:opacity-50"
              >
                revoke
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

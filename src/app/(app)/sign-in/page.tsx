"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { authClient } from "@/lib/auth-client";

function SignInForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") ?? "/settings/tokens";

  const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setError(null);
    const res =
      mode === "sign-up"
        ? await authClient.signUp.email({ email, password, name: name || email })
        : await authClient.signIn.email({ email, password });
    setBusy(false);
    if (res.error) {
      setError(res.error.message ?? "failed");
      return;
    }
    router.push(next);
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 px-6">
      <div>
        <p className="text-sm tracking-[0.3em] text-aurora uppercase">иччи</p>
        <h1 className="mt-2 text-2xl font-semibold">
          {mode === "sign-in" ? "Sign in" : "Create account"}
        </h1>
      </div>

      <button
        onClick={() => authClient.signIn.social({ provider: "github", callbackURL: next })}
        className="rounded-lg border border-rule bg-night-2 px-4 py-2.5 text-sm transition-colors hover:border-aurora"
      >
        Continue with GitHub
      </button>

      <div className="flex items-center gap-3 text-xs text-snow-3">
        <span className="h-px flex-1 bg-rule" />
        or with email
        <span className="h-px flex-1 bg-rule" />
      </div>

      <div className="space-y-3">
        {mode === "sign-up" && (
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="name"
            className="w-full rounded-lg border border-rule bg-night-2 px-3 py-2 text-sm outline-none placeholder:text-snow-3 focus:border-aurora"
          />
        )}
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="email"
          type="email"
          className="w-full rounded-lg border border-rule bg-night-2 px-3 py-2 text-sm outline-none placeholder:text-snow-3 focus:border-aurora"
        />
        <input
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="password"
          type="password"
          className="w-full rounded-lg border border-rule bg-night-2 px-3 py-2 text-sm outline-none placeholder:text-snow-3 focus:border-aurora"
        />
        <button
          onClick={submit}
          disabled={busy || !email || !password}
          className="w-full rounded-lg bg-aurora px-4 py-2.5 text-sm font-medium text-night disabled:opacity-50"
        >
          {mode === "sign-in" ? "Sign in" : "Sign up"}
        </button>
      </div>

      {error && <p className="text-sm text-berry">{error}</p>}

      <button
        onClick={() => setMode(mode === "sign-in" ? "sign-up" : "sign-in")}
        className="text-sm text-snow-2 underline"
      >
        {mode === "sign-in" ? "No account yet? Sign up" : "Have an account? Sign in"}
      </button>

      {/* No mail provider in the MVP — say it before someone needs it. */}
      <p className="text-xs text-snow-3">
        Note: password reset is not available on this instance (no mail
        configured). GitHub sign-in is recommended.
      </p>
    </main>
  );
}

export default function SignInPage() {
  // useSearchParams needs a suspense boundary under static prerendering.
  return (
    <Suspense>
      <SignInForm />
    </Suspense>
  );
}

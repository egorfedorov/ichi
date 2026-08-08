"use client";

import { authClient } from "@/lib/auth-client";
import type { Line } from "@/components/landing/commands";

/**
 * Signing in, minting a token and connecting — inside the terminal.
 *
 * The old flow sent people to /sign-in, then /settings/tokens, then /connect:
 * three navigations to reach the one command they came for. Every one of them
 * is a place to lose someone, and none of them showed anything the console
 * could not.
 *
 * So these are prompts, not pages. `:signin` asks for an email, then a
 * password, the way `ssh` does — the terminal is already the interface, and a
 * login form floating over it would admit the whole conceit was decoration.
 *
 * Passwords never enter the transcript: the input switches to a masked field
 * while one is being asked for, and the echoed line is dots.
 */

export type PromptKind = "email" | "password" | "name" | null;

export interface SessionState {
  /** What the prompt is currently waiting for, if anything. */
  awaiting: PromptKind;
  /** Collected between steps of a multi-step flow. */
  draft: { email?: string; mode?: "in" | "up" };
  /** Signed-in email, or null. */
  email: string | null;
}

export const EMPTY_SESSION: SessionState = { awaiting: null, draft: {}, email: null };

const out = (text: string): Line => ({ kind: "out", text });
const dim = (text: string): Line => ({ kind: "dim", text });
const ok = (text: string): Line => ({ kind: "accent", text });
const err = (text: string): Line => ({ kind: "err", text });

export interface StepResult {
  lines: Line[];
  session: SessionState;
}

/** Who is signed in, asked of the server rather than assumed. */
export async function whoami(): Promise<string | null> {
  try {
    const res = await fetch("/api/tokens");
    if (!res.ok) return null;
    // /api/tokens is session-guarded, so a 200 means signed in. The email
    // itself comes from better-auth.
    const s = await authClient.getSession();
    return s.data?.user?.email ?? "signed in";
  } catch {
    return null;
  }
}

export function beginSignIn(mode: "in" | "up"): StepResult {
  return {
    lines: [
      ok(mode === "in" ? "Sign in." : "Create an account."),
      dim("  Your email, or :cancel to stop."),
    ],
    session: { awaiting: "email", draft: { mode }, email: null },
  };
}

/**
 * Advance a prompt flow by one answer. Returns the lines to print and the
 * next session state; the caller owns rendering and focus.
 */
export async function advance(
  session: SessionState,
  answer: string,
): Promise<StepResult> {
  if (answer.trim() === ":cancel") {
    return { lines: [dim("cancelled.")], session: { ...EMPTY_SESSION, email: session.email } };
  }

  if (session.awaiting === "email") {
    const email = answer.trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return { lines: [err("that does not look like an email — try again")], session };
    }
    return {
      lines: [dim("  Password (at least 8 characters).")],
      session: { ...session, awaiting: "password", draft: { ...session.draft, email } },
    };
  }

  if (session.awaiting === "password") {
    const password = answer;
    const email = session.draft.email!;
    if (password.length < 8) {
      return { lines: [err("at least 8 characters — try again")], session };
    }

    try {
      const res =
        session.draft.mode === "up"
          ? await authClient.signUp.email({ email, password, name: email })
          : await authClient.signIn.email({ email, password });

      if (res.error) {
        return {
          lines: [
            err(`${res.error.message ?? "could not sign in"}`),
            dim("  :signup creates an account · :signin tries again"),
          ],
          session: { ...EMPTY_SESSION, email: null },
        };
      }

      return {
        lines: [
          ok(`Signed in as ${email}.`),
          dim("  :token mints an MCP token · :connect shows the command"),
        ],
        session: { awaiting: null, draft: {}, email },
      };
    } catch {
      return {
        lines: [err("the server did not answer — try again in a moment")],
        session: { ...EMPTY_SESSION, email: null },
      };
    }
  }

  return { lines: [], session };
}

/**
 * Mint an MCP token and print it once.
 *
 * Printed into the transcript deliberately, with the warning next to it: the
 * plaintext exists exactly once and the server keeps only a hash, so a token
 * shown somewhere the reader might scroll past is a token lost.
 */
export async function mintToken(session: SessionState): Promise<StepResult> {
  if (!session.email) {
    return {
      lines: [err("not signed in — run :signin first")],
      session,
    };
  }
  try {
    const res = await fetch("/api/tokens", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "console" }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      return { lines: [err(body.error ?? "could not mint a token")], session };
    }
    const data = (await res.json()) as { token: string };
    return {
      lines: [
        ok(data.token),
        dim("  Shown once. The server keeps only a hash — copy it now."),
        dim("  :connect turns it into the command for your client."),
      ],
      session,
    };
  } catch {
    return { lines: [err("the server did not answer")], session };
  }
}

/** The ichchi this account carries, listed in the console. */
export async function listMine(session: SessionState): Promise<StepResult> {
  if (!session.email) {
    return { lines: [err("not signed in — run :signin first")], session };
  }
  try {
    const res = await fetch("/api/ichchi/mine");
    if (!res.ok) return { lines: [err("could not read your ichchi")], session };
    const data = (await res.json()) as {
      ichchi: { name: string; slug: string; archetype: string; mood: string; bond: number }[];
    };
    if (data.ichchi.length === 0) {
      return {
        lines: [
          dim("No ichchi yet."),
          dim("  :spirits shows the archetypes · your agent adopts one with ichchi_adopt"),
        ],
        session,
      };
    }
    return {
      lines: [
        ok("YOUR ICHCHI"),
        ...data.ichchi.map((i) => ({
          kind: "out" as const,
          text: `  ${i.name.padEnd(18)} ${i.slug.padEnd(16)} ${i.archetype.padEnd(9)} ${i.mood} · bond ${i.bond}/100`,
        })),
      ],
      session,
    };
  } catch {
    return { lines: [err("the server did not answer")], session };
  }
}

/** Live tokens, and how to revoke one. */
export async function listTokens(session: SessionState): Promise<StepResult> {
  if (!session.email) {
    return { lines: [err("not signed in — run :signin first")], session };
  }
  try {
    const res = await fetch("/api/tokens");
    if (!res.ok) return { lines: [err("could not read your tokens")], session };
    const data = (await res.json()) as {
      tokens: { id: string; prefix: string; name: string | null; last_used_at: string | null }[];
    };
    if (data.tokens.length === 0) {
      return { lines: [dim("No tokens yet — :token mints one.")], session };
    }
    return {
      lines: [
        ok("YOUR TOKENS"),
        ...data.tokens.map((tk) => ({
          kind: "out" as const,
          text:
            `  ${tk.prefix}…  ${(tk.name ?? "unnamed").padEnd(14)} ` +
            (tk.last_used_at ? `last used ${tk.last_used_at.slice(0, 10)}` : "never used"),
        })),
        dim("  :revoke <prefix> takes one out of service."),
      ],
      session,
    };
  } catch {
    return { lines: [err("the server did not answer")], session };
  }
}

/** Revoke by prefix — the only part of a token a person ever sees again. */
export async function revokeToken(
  session: SessionState,
  prefix: string,
): Promise<StepResult> {
  if (!session.email) return { lines: [err("not signed in")], session };
  if (!prefix) return { lines: [err("which one? :revoke <prefix>")], session };
  try {
    const list = await fetch("/api/tokens").then((r) => r.json());
    const match = (list.tokens as { id: string; prefix: string }[]).find((tk) =>
      tk.prefix.startsWith(prefix.replace(/…$/, "")),
    );
    if (!match) return { lines: [err(`no token starting ${prefix}`)], session };
    const res = await fetch("/api/tokens", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: match.id }),
    });
    return {
      lines: res.ok
        ? [ok(`${match.prefix}… revoked. Any client using it stops working now.`)]
        : [err("could not revoke it")],
      session,
    };
  } catch {
    return { lines: [err("the server did not answer")], session };
  }
}

export { out, dim, ok, err };

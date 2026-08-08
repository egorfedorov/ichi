import { betterAuth } from "better-auth";
// Relative, not "@/..." — the better-auth CLI loads this file outside the
// Next.js resolver and does not honour tsconfig path aliases.
import { pool } from "../db";
import { env } from "./env";

/**
 * Identity. better-auth owns the "user"/"session"/"account"/"verification"
 * tables (migration 0000); app tables FK into "user"(id).
 */
export const auth = betterAuth({
  database: pool,
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.BETTER_AUTH_URL,

  socialProviders: {
    // GitHub verifies the email address as a side effect, which is why it is
    // the recommended sign-in: see the note on emailAndPassword below.
    ...(env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET
      ? {
          github: {
            clientId: env.GITHUB_CLIENT_ID,
            clientSecret: env.GITHUB_CLIENT_SECRET,
          },
        }
      : {}),
  },

  // Email/password stays on for self-hosters who never configure OAuth.
  // There is no mail provider in the MVP, so a forgotten password cannot be
  // reset — say so on the sign-in page rather than discovering it at 3am.
  emailAndPassword: {
    enabled: true,
  },
});

export type Session = typeof auth.$Infer.Session;

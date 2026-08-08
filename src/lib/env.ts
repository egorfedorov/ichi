import { z } from "zod";

/**
 * Validated process env. Import this instead of touching process.env directly —
 * a missing var should fail at boot with a readable message, not at 3am inside
 * a reflection job.
 */
/**
 * A blank line in a .env file parses to "", which would defeat .default().
 * Treat empty as unset so the default applies.
 */
const defaulted = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((v) => (v === "" ? undefined : v), schema);

const schema = z.object({
  DATABASE_URL: z.string().min(1),

  // The Postgres schema ichi's own tables live in.
  //
  // "public" by default, which is what every existing install and the current
  // production database use — this must stay a no-op until someone opts in.
  //
  // Set it to "ichi" to share a database with a sibling product: ichi's tables
  // move into their own namespace while the shared identity tables (user,
  // session, account) stay in public, owned by whoever migrates them. The
  // search_path is `<schema>, public`, so a name resolves locally first and
  // falls through to the shared ones.
  DB_SCHEMA: defaulted(z.string().regex(/^[a-z_][a-z0-9_]*$/).default("public")),

  ANTHROPIC_API_KEY: z.string().min(1).optional(),
  // Any Anthropic-compatible endpoint. Lets the app run through a reseller
  // (apimart, OpenRouter, …) when a card for console.anthropic.com is not an
  // option — the request and response shapes are identical, so nothing else
  // in the codebase changes.
  ANTHROPIC_BASE_URL: z.string().url().optional(),
  // Reflection reads ichi events and commits personality drift. It runs
  // often and on small inputs, so the cheap model is the default, not an
  // upgrade path.
  MODEL_JUDGE: z.string().default("claude-haiku-4-5"),

  // Optional in the schema so `next build` can evaluate modules without a
  // real secret; better-auth refuses to actually sign sessions without one.
  BETTER_AUTH_SECRET: z.string().min(16).optional(),
  BETTER_AUTH_URL: z.string().url().default("http://localhost:3400"),
  GITHUB_CLIENT_ID: z.string().optional(),
  GITHUB_CLIENT_SECRET: z.string().optional(),

  NEXT_PUBLIC_APP_URL: defaulted(z.string().url().default("http://localhost:3400")),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((i) => `  ${i.path.join(".")}: ${i.message}`)
    .join("\n");
  throw new Error(`Invalid environment:\n${issues}\n\nCopy .env.example to .env`);
}

export const env = parsed.data;

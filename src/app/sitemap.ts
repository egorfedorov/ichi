import type { MetadataRoute } from "next";
import { query } from "@/db";
import { env } from "@/lib/env";

/**
 * The sitemap.
 *
 * Two kinds of page and nothing else: the console, and every ichi somebody
 * chose to publish. Session surfaces, invitations and /mcp are excluded here
 * as well as in robots.txt — belt and braces, because a sitemap that lists a
 * /join code would hand invitations to a crawler.
 *
 * Published pages are listed because being found is the whole point of
 * publishing one. `updated_at` gives crawlers an honest lastModified instead
 * of the "everything changed today" that a hardcoded new Date() would claim.
 */
export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = env.NEXT_PUBLIC_APP_URL;

  let published: { public_slug: string; updated_at: Date }[] = [];
  try {
    published = await query<{ public_slug: string; updated_at: Date }>(
      `select public_slug, updated_at
         from ichi
        where public_slug is not null and departed_at is null
        order by updated_at desc
        limit 5000`,
    );
  } catch {
    // A sitemap that 500s teaches a crawler to stop asking. The console entry
    // alone is a valid sitemap, so a database blip costs a list, not the file.
  }

  return [
    {
      url: base,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 1,
    },
    ...published.map((i) => ({
      url: `${base}/i/${i.public_slug}`,
      lastModified: i.updated_at,
      changeFrequency: "daily" as const,
      priority: 0.6,
    })),
  ];
}

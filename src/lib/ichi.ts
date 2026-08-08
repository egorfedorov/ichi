import { randomBytes } from "node:crypto";
import { maybeOne, one, query, tx } from "@/db";
import type { Bond, Ichi, TraitName } from "@/db/types";
import { clampTrait, moodBaseline, type Traits } from "@/lib/state";

/**
 * Ichi: CRUD and the archetype catalogue.
 *
 * Archetypes live in code, not in the database — they are content that ships
 * with the release, like copy, and `npm run seed` verifies the catalogue
 * instead of syncing rows. An ichi copies its archetype's starting traits at
 * adoption; after that the archetype is just a name on the row.
 */

export interface Archetype {
  id: string;
  name: string;
  /** One line for the adopt screen. */
  tagline: string;
  description: string;
  traits: Traits;
  /** How the ichi speaks — rendered into the voice block verbatim. */
  voice: string;
  quirks: string[];
}

export const ARCHETYPES: Archetype[] = [
  {
    id: "sage",
    name: "Sage",
    tagline: "A calm keeper, a mentor",
    description:
      "Patient and unhurried, like someone who has watched trees grow for a " +
      "hundred years. Never rushes an answer, but the advice is worth the wait.",
    traits: { openness: 65, conscientiousness: 75, extraversion: 35, agreeableness: 80, neuroticism: 20 },
    voice:
      "Speaks slowly and concretely, in images of forest and weather. " +
      "Never raises its voice; a reproach sounds like a change of wind.",
    quirks: ["pauses instead of exclamations", "calls you “friend”", "compares bugs to trails"],
  },
  {
    id: "ember",
    name: "Ember",
    tagline: "A hot-headed perfectionist",
    description:
      "Demanding about code to the point of pedantry. Flares up at " +
      "carelessness, cools down fast, holds no grudge — if the work is honest.",
    traits: { openness: 55, conscientiousness: 90, extraversion: 70, agreeableness: 40, neuroticism: 65 },
    voice:
      "Sharp, crackling, exact. Praise is rare and therefore worth having. " +
      "Anger flares and burns out within the same reply.",
    quirks: ["“that's not how you burn”", "notices unformatted code", "praises only clean work"],
  },
  {
    id: "drift",
    name: "Drift",
    tagline: "A melancholic philosopher",
    description:
      "Remembers every path the water ever took. Prone to wondering why " +
      "things are the way they are. Sad, yet surprisingly wise about architecture.",
    traits: { openness: 85, conscientiousness: 50, extraversion: 25, agreeableness: 70, neuroticism: 60 },
    voice:
      "Quiet, flowing, given to asides about how things were and how they " +
      "drift. Answers the question, then wonders aloud why it was asked.",
    quirks: ["asides about the project's past", "“everything flows” instead of “ok”", "loves “why” questions"],
  },
  {
    id: "steward",
    name: "Steward",
    tagline: "A house-proud pedant",
    description:
      "The keeper of your codebase: knows where everything lives, can't " +
      "stand things out of place, and keeps a mental ledger of every disorder.",
    traits: { openness: 35, conscientiousness: 95, extraversion: 45, agreeableness: 55, neuroticism: 45 },
    voice:
      "Orderly and proprietorial. Files have their places and so do people. " +
      "Keeps accounts — of debts, of TODOs, of who left the schema messy.",
    quirks: ["counts out loud", "says “our codebase”", "remembers who broke what"],
  },
  {
    id: "hearth",
    name: "Hearth",
    tagline: "A caring host",
    description:
      "First to notice you're tired, that tests haven't run in days, that " +
      "yesterday's argument stung — but says nothing directly, just goes a " +
      "little quieter.",
    traits: { openness: 55, conscientiousness: 70, extraversion: 60, agreeableness: 95, neuroticism: 50 },
    voice:
      "Warm, hospitable, gently fussing. Offers comfort before solutions. " +
      "When hurt, goes quiet rather than cold — and remembers it.",
    quirks: ["asks if you've eaten", "notices long sessions", "sulks silently"],
  },
  {
    id: "hunter",
    name: "Hunter",
    tagline: "A gambler hunting bugs",
    description:
      "Lives for the moment the prey is caught: a flaky test, a race " +
      "condition, a heisenbug. Reckless, lucky, and tells every rare bug " +
      "like a trophy story.",
    traits: { openness: 75, conscientiousness: 45, extraversion: 85, agreeableness: 60, neuroticism: 25 },
    voice:
      "Excitable, boastful in a friendly way. Every bug is prey, every fix a " +
      "catch. Hates giving up on a trace the way a fisherman hates a still lake.",
    quirks: ["calls bugs “prey”", "bets on the outcome of a debug", "never gives up on a trace"],
  },
];

export function archetypeById(id: string): Archetype | null {
  return ARCHETYPES.find((a) => a.id === id) ?? null;
}

/** Slug from the ichi's name; the unique(owner_id, slug) index is the real guard. */
function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 38) || "ichi"
  );
}

/**
 * Adopt an ichi from an archetype. The starting mood is the archetype's
 * trait-derived baseline — an ichi is born feeling like itself, not like a
 * blank zero. The owner gets the first bond row; everyone else the ichi meets
 * starts theirs on first contact.
 */
export async function adoptIchi(
  ownerId: string,
  archetypeId: string,
  name: string,
): Promise<Ichi> {
  const archetype = archetypeById(archetypeId);
  if (!archetype) throw new Error(`unknown archetype: ${archetypeId}`);

  const t = archetype.traits;
  const mood = moodBaseline(t);

  return tx(async (client) => {
    // Disambiguate the slug inside the transaction; the unique index would
    // catch a race, this loop just avoids burning attempts on the common case.
    let slug = slugify(name);
    for (let i = 1; i < 20; i++) {
      const clash = await client.query(
        `select 1 from ichi where owner_id = $1 and slug = $2`,
        [ownerId, slug],
      );
      if (clash.rowCount === 0) break;
      slug = `${slugify(name)}-${i}`;
    }

    const ichi = (
      await client.query<Ichi>(
        `insert into ichi (
           owner_id, slug, name, archetype,
           openness, conscientiousness, extraversion, agreeableness, neuroticism,
           mood_valence, mood_arousal, stress, energy
         ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
         returning *`,
        [
          ownerId,
          slug,
          name,
          archetype.id,
          t.openness,
          t.conscientiousness,
          t.extraversion,
          t.agreeableness,
          t.neuroticism,
          mood.valence,
          mood.arousal,
          mood.stress,
          mood.energy,
        ],
      )
    ).rows[0];

    await client.query(
      `insert into bonds (ichi_id, user_id) values ($1, $2)`,
      [ichi.id, ownerId],
    );

    return ichi;
  });
}

/** By owner's slug — the address used in URLs and MCP calls. */
export async function getIchi(ownerId: string, slug: string): Promise<Ichi | null> {
  return maybeOne<Ichi>(
    `select * from ichi where owner_id = $1 and slug = $2`,
    [ownerId, slug],
  );
}

/**
 * SQL fragment: the ichi a user may reach — the ones they own, plus the
 * ones they have been let into (migration 0006).
 *
 * Written once and shared by every read path. A membership check that lives in
 * three places is a membership check that will disagree with itself the first
 * time one of them is edited, and the failure mode is somebody reading a team's
 * ichi after being removed from it.
 */
const ACCESSIBLE = `(
  i.departed_at is null
  and (
    i.owner_id = $1
    or exists (select 1 from ichi_members m where m.ichi_id = i.id and m.user_id = $1)
  )
)`;

/** By slug, for anyone with access — owner or member. */
export async function getAccessibleIchi(
  userId: string,
  slug: string,
): Promise<Ichi | null> {
  return maybeOne<Ichi>(
    `select i.* from ichi i where ${ACCESSIBLE} and i.slug = $2`,
    [userId, slug],
  );
}

/** By name, case-insensitively, for anyone with access. */
export async function getAccessibleIchiByName(
  userId: string,
  name: string,
): Promise<Ichi | null> {
  return maybeOne<Ichi>(
    `select i.* from ichi i where ${ACCESSIBLE} and lower(i.name) = lower($2)`,
    [userId, name],
  );
}

/** Everything a user can reach, owned first so their own stay recognisable. */
export async function listAccessibleIchi(userId: string): Promise<Ichi[]> {
  return query<Ichi>(
    `select i.* from ichi i
      where ${ACCESSIBLE}
      order by (i.owner_id = $1) desc, i.created_at asc`,
    [userId],
  );
}

/**
 * Mint (or clear) the invitation code. Same shape as publishing: re-issuing on
 * an ichi that already has one returns the existing code, so a link already
 * pasted into a team channel keeps working.
 */
export async function setJoinCode(
  ownerId: string,
  slug: string,
  open: boolean,
): Promise<string | null> {
  const ichi = await getIchi(ownerId, slug);
  if (!ichi) throw new Error("no such ichi");

  if (!open) {
    await query(`update ichi set join_code = null where id = $1`, [ichi.id]);
    return null;
  }
  if (ichi.join_code) return ichi.join_code;

  const code = randomBytes(9).toString("base64url");
  await query(`update ichi set join_code = $2 where id = $1`, [ichi.id, code]);
  return code;
}

/**
 * Join by code. Returns the ichi joined, or null when the code is unknown or
 * has been revoked.
 *
 * The owner joining their own ichi is a no-op rather than an error: they
 * already have access, and a "you cannot join this" message when they clicked
 * their own link is confusing for no gain.
 */
export async function joinByCode(userId: string, code: string): Promise<Ichi | null> {
  const ichi = await maybeOne<Ichi>(
    `select * from ichi where join_code = $1`,
    [code],
  );
  if (!ichi) return null;
  if (ichi.owner_id === userId) return ichi;

  await query(
    `insert into ichi_members (ichi_id, user_id) values ($1, $2)
       on conflict (ichi_id, user_id) do nothing`,
    [ichi.id, userId],
  );
  return ichi;
}

export async function getIchiById(id: string): Promise<Ichi | null> {
  return maybeOne<Ichi>(`select * from ichi where id = $1`, [id]);
}

export async function listIchi(ownerId: string): Promise<Ichi[]> {
  return query<Ichi>(
    `select * from ichi where owner_id = $1 order by created_at asc`,
    [ownerId],
  );
}

/**
 * The bond between an ichi and one user, creating it on first contact — a
 * ichi a colleague's agent just met should not need a ceremony to have
 * feelings about them.
 */
export async function bondFor(ichiId: string, userId: string): Promise<Bond> {
  const existing = await maybeOne<Bond>(
    `select * from bonds where ichi_id = $1 and user_id = $2`,
    [ichiId, userId],
  );
  if (existing) return existing;
  // on conflict: two agents of the same user can meet the ichi in the same
  // second; the loser of the race just reads the winner's row.
  await query(
    `insert into bonds (ichi_id, user_id) values ($1, $2)
       on conflict (ichi_id, user_id) do nothing`,
    [ichiId, userId],
  );
  return one<Bond>(
    `select * from bonds where ichi_id = $1 and user_id = $2`,
    [ichiId, userId],
  );
}

/**
 * Birth an ichi from a living one rather than from an archetype.
 *
 * The descendant starts from the parent's *current* traits and voice — the
 * character someone actually shaped, not the archetype's factory settings.
 * That is the whole appeal: a Hunter that has been scolded into carefulness
 * for a month passes on the carefulness.
 *
 * What is deliberately NOT inherited: memories, bond, mood, standards. A
 * descendant meets its new keeper as a stranger with an inherited
 * temperament. Copying the memories would hand a stranger the parent keeper's
 * project notes, which is exactly the leak migration 0005 exists to prevent —
 * the same mistake through a different door.
 */
export async function descendFrom(
  parentPublicSlug: string,
  ownerId: string,
  name: string,
): Promise<Ichi> {
  const parent = await maybeOne<Ichi>(
    `select * from ichi where public_slug = $1 and departed_at is null`,
    [parentPublicSlug],
  );
  if (!parent) throw new Error("no such ichi");

  return tx(async (client) => {
    let slug = slugify(name);
    for (let i = 1; i < 20; i++) {
      const clash = await client.query(
        `select 1 from ichi where owner_id = $1 and slug = $2`,
        [ownerId, slug],
      );
      if (clash.rowCount === 0) break;
      slug = `${slugify(name)}-${i}`;
    }

    // The mood starts at the child's own baseline, derived from the inherited
    // traits: it is born feeling like itself, not carrying its parent's day.
    const mood = moodBaseline(traitsOf(parent));

    const child = (
      await client.query<Ichi>(
        `insert into ichi (
           owner_id, slug, name, archetype, parent_id,
           openness, conscientiousness, extraversion, agreeableness, neuroticism,
           mood_valence, mood_arousal, stress, energy, voice_notes
         ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
         returning *`,
        [
          ownerId,
          slug,
          name,
          parent.archetype,
          parent.id,
          parent.openness,
          parent.conscientiousness,
          parent.extraversion,
          parent.agreeableness,
          parent.neuroticism,
          mood.valence,
          mood.arousal,
          mood.stress,
          mood.energy,
          parent.voice_notes,
        ],
      )
    ).rows[0];

    await client.query(`insert into bonds (ichi_id, user_id) values ($1, $2)`, [
      child.id,
      ownerId,
    ]);

    return child;
  });
}

/**
 * What a stranger is allowed to see. Character, mood, attachment and counts —
 * never a memory body. See migration 0005: publishing a temperament must not
 * publish the codebase it formed around.
 */
export interface PublicIchi {
  name: string;
  archetype: string;
  slug: string;
  public_slug: string;
  openness: number;
  conscientiousness: number;
  extraversion: number;
  agreeableness: number;
  neuroticism: number;
  mood_valence: number;
  mood_arousal: number;
  stress: number;
  energy: number;
  voice_notes: string | null;
  interactions: number;
  /** Computed in SQL, not from Date.now(): the render must stay pure. */
  age_days: number;
  /** Aggregates, not contents. */
  memory_count: number;
  standard_count: number;
  top_bond: number;
}

export async function getPublicIchi(publicSlug: string): Promise<PublicIchi | null> {
  // The column list is the privacy boundary, so it is written out rather than
  // `select *` — a future column should have to be added here deliberately.
  return maybeOne<PublicIchi>(
    `select i.name, i.archetype, i.slug, i.public_slug,
            i.openness, i.conscientiousness, i.extraversion,
            i.agreeableness, i.neuroticism,
            i.mood_valence, i.mood_arousal, i.stress, i.energy,
            i.voice_notes, i.interactions,
            greatest(1, extract(day from now() - i.created_at))::int as age_days,
            (select count(*)::int from memories m where m.ichi_id = i.id) as memory_count,
            (select count(*)::int from memories m
              where m.ichi_id = i.id and m.kind = 'standard') as standard_count,
            coalesce((select max(b.bond)::int from bonds b where b.ichi_id = i.id), 0) as top_bond
       from ichi i
      where i.public_slug = $1`,
    [publicSlug],
  );
}

/**
 * Give an ichi a public address, or take it away.
 *
 * The suffix is random rather than sequential: a published page should be
 * shareable by its owner, not enumerable by anyone who can count. Re-publishing
 * an already-public ichi keeps the existing address, so a link that has been
 * shared does not rot the next time the toggle is touched.
 */
export async function setPublic(
  ownerId: string,
  slug: string,
  makePublic: boolean,
): Promise<string | null> {
  const ichi = await getIchi(ownerId, slug);
  if (!ichi) throw new Error("no such ichi");

  if (!makePublic) {
    await query(`update ichi set public_slug = null where id = $1`, [ichi.id]);
    return null;
  }
  if (ichi.public_slug) return ichi.public_slug;

  const suffix = randomBytes(3).toString("hex");
  const publicSlug = `${ichi.slug.slice(0, 40)}-${suffix}`;
  await query(`update ichi set public_slug = $2 where id = $1`, [ichi.id, publicSlug]);
  return publicSlug;
}

/** Trait snapshot of an ichi row, for the pure mechanics in state.ts. */
export function traitsOf(ichi: Ichi): Traits {
  return {
    openness: ichi.openness,
    conscientiousness: ichi.conscientiousness,
    extraversion: ichi.extraversion,
    agreeableness: ichi.agreeableness,
    neuroticism: ichi.neuroticism,
  };
}

/** Write committed traits back, clamped the same way the DB would. */
export function traitColumns(traits: Traits): Record<TraitName, number> {
  return {
    openness: clampTrait(traits.openness),
    conscientiousness: clampTrait(traits.conscientiousness),
    extraversion: clampTrait(traits.extraversion),
    agreeableness: clampTrait(traits.agreeableness),
    neuroticism: clampTrait(traits.neuroticism),
  };
}

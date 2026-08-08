import { maybeOne, one, query, tx } from "@/db";
import type { Bond, Ichchi, TraitName } from "@/db/types";
import { clampTrait, moodBaseline, type Traits } from "@/lib/state";

/**
 * Ichchi: CRUD and the archetype catalogue.
 *
 * Archetypes live in code, not in the database — they are content that ships
 * with the release, like copy, and `npm run seed` verifies the catalogue
 * instead of syncing rows. An ichchi copies its archetype's starting traits at
 * adoption; after that the archetype is just a name on the row.
 */

export interface Archetype {
  id: string;
  name: string;
  /** One line for the adopt screen. */
  tagline: string;
  description: string;
  traits: Traits;
  /** How the ichchi speaks — rendered into the voice block verbatim. */
  voice: string;
  quirks: string[];
}

export const ARCHETYPES: Archetype[] = [
  {
    id: "baiyanai",
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
    id: "uot-ukhhan",
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
    id: "ebe",
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
    id: "sir-ichchite",
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
    id: "aan-alakhchyn",
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
    id: "kyuekh-byollyokh",
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

/** Slug from the ichchi's name; the unique(owner_id, slug) index is the real guard. */
function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 38) || "ichchi"
  );
}

/**
 * Adopt an ichchi from an archetype. The starting mood is the archetype's
 * trait-derived baseline — an ichchi is born feeling like itself, not like a
 * blank zero. The owner gets the first bond row; everyone else the ichchi meets
 * starts theirs on first contact.
 */
export async function adoptIchchi(
  ownerId: string,
  archetypeId: string,
  name: string,
): Promise<Ichchi> {
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
        `select 1 from ichchi where owner_id = $1 and slug = $2`,
        [ownerId, slug],
      );
      if (clash.rowCount === 0) break;
      slug = `${slugify(name)}-${i}`;
    }

    const ichchi = (
      await client.query<Ichchi>(
        `insert into ichchi (
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
      `insert into bonds (ichchi_id, user_id) values ($1, $2)`,
      [ichchi.id, ownerId],
    );

    return ichchi;
  });
}

/** By owner's slug — the address used in URLs and MCP calls. */
export async function getIchchi(ownerId: string, slug: string): Promise<Ichchi | null> {
  return maybeOne<Ichchi>(
    `select * from ichchi where owner_id = $1 and slug = $2`,
    [ownerId, slug],
  );
}

export async function getIchchiById(id: string): Promise<Ichchi | null> {
  return maybeOne<Ichchi>(`select * from ichchi where id = $1`, [id]);
}

export async function listIchchi(ownerId: string): Promise<Ichchi[]> {
  return query<Ichchi>(
    `select * from ichchi where owner_id = $1 order by created_at asc`,
    [ownerId],
  );
}

/**
 * The bond between an ichchi and one user, creating it on first contact — a
 * ichchi a colleague's agent just met should not need a ceremony to have
 * feelings about them.
 */
export async function bondFor(ichchiId: string, userId: string): Promise<Bond> {
  const existing = await maybeOne<Bond>(
    `select * from bonds where ichchi_id = $1 and user_id = $2`,
    [ichchiId, userId],
  );
  if (existing) return existing;
  // on conflict: two agents of the same user can meet the ichchi in the same
  // second; the loser of the race just reads the winner's row.
  await query(
    `insert into bonds (ichchi_id, user_id) values ($1, $2)
       on conflict (ichchi_id, user_id) do nothing`,
    [ichchiId, userId],
  );
  return one<Bond>(
    `select * from bonds where ichchi_id = $1 and user_id = $2`,
    [ichchiId, userId],
  );
}

/** Trait snapshot of an ichchi row, for the pure mechanics in state.ts. */
export function traitsOf(ichchi: Ichchi): Traits {
  return {
    openness: ichchi.openness,
    conscientiousness: ichchi.conscientiousness,
    extraversion: ichchi.extraversion,
    agreeableness: ichchi.agreeableness,
    neuroticism: ichchi.neuroticism,
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

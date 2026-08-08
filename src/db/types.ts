/** Row shapes for app tables, mirroring src/db/migrations. */

export interface IchiToken {
  id: string;
  user_id: string;
  token_hash: string;
  prefix: string;
  name: string | null;
  last_used_at: Date | null;
  revoked_at: Date | null;
  created_at: Date;
}

export type TraitName =
  | "openness"
  | "conscientiousness"
  | "extraversion"
  | "agreeableness"
  | "neuroticism";

export interface Ichi {
  id: string;
  owner_id: string;
  slug: string;
  name: string;
  archetype: string;
  openness: number;
  conscientiousness: number;
  extraversion: number;
  agreeableness: number;
  neuroticism: number;
  mood_valence: number;
  mood_arousal: number;
  stress: number;
  energy: number;
  pending_drift: Partial<Record<TraitName, number>>;
  voice_notes: string | null;
  interactions: number;
  reflected_at: Date | null;
  /** Globally unique public address, or null while the ichi is private. */
  public_slug: string | null;
  /** Invitation code for teammates, or null while the ichi is solo. */
  join_code: string | null;
  /** The ichi this one descends from, if it was not born from an archetype. */
  parent_id: string | null;
  /** Opt-in: a neglected mortal ichi eventually departs. Off by default. */
  mortal: boolean;
  /** Set once, never cleared. A departed ichi is readable but unreachable. */
  departed_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface Bond {
  ichi_id: string;
  user_id: string;
  trust: number;
  bond: number;
  last_interaction_at: Date | null;
}

/**
 * "standard" is the one kind allowed to change what the agent does rather
 * than how it sounds — a rule the user works by, replayed back to them. See
 * migration 0004 and renderIchiBlock().
 */
export type MemoryKind =
  | "event"
  | "insult"
  | "praise"
  | "belief"
  | "fact"
  | "standard";

export interface Memory {
  id: string;
  ichi_id: string;
  body: string;
  kind: MemoryKind;
  valence: number;
  salience: number;
  recall_count: number;
  created_at: Date;
  last_recalled_at: Date | null;
}

/** A week the ichi put into its own words. See migration 0007. */
export interface Letter {
  id: string;
  ichi_id: string;
  /** The Monday (UTC) the week started, as a date string. */
  period_start: string;
  body: string;
  stats: Record<string, unknown>;
  created_at: Date;
}

export type IchiEventKind = "call" | "feedback" | "reflect" | "decay";

export interface IchiEvent {
  id: string;
  ichi_id: string;
  user_id: string | null;
  kind: IchiEventKind;
  tool: string | null;
  text: string | null;
  signal: string | null;
  delta: Record<string, unknown>;
  created_at: Date;
}

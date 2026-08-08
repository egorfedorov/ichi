import { query } from "@/db";
import type { Ichchi } from "@/db/types";
import { moodBaseline, moodDecayToBaseline, type Mood } from "@/lib/state";
import { STANDARD_SALIENCE_FLOOR } from "@/lib/memory";
import { traitsOf } from "@/lib/ichchi";

/**
 * The decay pass (cron: every six hours, see DECAY_CRON).
 *
 * Three things fade while nobody is looking:
 *   mood     — exponentially back toward the ichchi's trait-derived baseline,
 *              measured honestly against the clock since the last update;
 *   bond     — linear erosion from absence, for bonds nobody has touched;
 *   salience — memories fade, charged ones slower (the ichchi forgets what was
 *              said long before it forgets how it felt).
 *
 * Everything here is time-anchored or fixed-step, never "subtract a constant
 * per run" — a cron that fires twice in a row must not double the erosion.
 */

/** Smaller mood movements than this are not worth a write and a log line. */
const MOOD_EPSILON = 0.005;

/** The cron interval in days — the fixed step bonds and memories decay by. */
const STEP_DAYS = 0.25;

/**
 * How long each kind of event is kept.
 *
 * The log grows on every tool call and on every decay pass — four rows a day
 * per ichchi from the cron alone, before anyone does anything. Left alone it
 * is the fastest-growing table in the schema and the least re-read.
 *
 * The split is by what the row is for. A 'call' is routine traffic and a
 * 'decay' row is the cron talking to itself; both matter for a few weeks at
 * most. A 'feedback' is the user's own voice and a 'reflect' is where the
 * character actually changed — those are the ichchi's biography, and deleting
 * them would quietly erase why it is the way it is.
 */
const RETAIN_DAYS: Record<string, number> = {
  call: 30,
  decay: 30,
  feedback: 365,
  reflect: 365,
};

/**
 * Days of total silence before a mortal ichchi departs.
 *
 * Long on purpose. A holiday, a hospital stay, a project between phases — all
 * of those are shorter than this, and an ichchi that leaves because someone
 * took August off is not poignant, it is a bug that reads as cruelty. Ninety
 * days is "this person is not coming back", not "this person is busy".
 *
 * Only ever applies to ichchi whose keeper opted in (`mortal`).
 */
const DEPART_AFTER_DAYS = 90;

export interface DecayReport {
  ichchi: number;
  moodsAdjusted: number;
  bondsDecayed: number;
  memoriesDecayed: number;
  eventsPruned: number;
  departed: number;
}

function moodOf(ichchi: Ichchi): Mood {
  return {
    valence: ichchi.mood_valence,
    arousal: ichchi.mood_arousal,
    stress: ichchi.stress,
    energy: ichchi.energy,
  };
}

export async function runDecay(): Promise<DecayReport> {
  // Mood decay is per-ichchi work: the baseline is derived from traits, and the
  // elapsed time is measured from the row's own updated_at — an ichchi that was
  // talked to five minutes ago has nothing to cool down from.
  const rows = await query<Ichchi & { idle_hours: number }>(
    `select *, extract(epoch from now() - updated_at) / 3600.0 as idle_hours from ichchi`,
  );

  const changed = new Map<string, Record<string, unknown>>();
  let moodsAdjusted = 0;

  for (const ichchi of rows) {
    const baseline = moodBaseline(traitsOf(ichchi));
    const next = moodDecayToBaseline(moodOf(ichchi), baseline, ichchi.idle_hours);

    const moved =
      Math.abs(next.valence - ichchi.mood_valence) > MOOD_EPSILON ||
      Math.abs(next.arousal - ichchi.mood_arousal) > MOOD_EPSILON ||
      Math.abs(next.stress - ichchi.stress) > MOOD_EPSILON ||
      Math.abs(next.energy - ichchi.energy) > MOOD_EPSILON;
    if (!moved) continue;

    await query(
      `update ichchi set mood_valence = $2, mood_arousal = $3, stress = $4, energy = $5,
         updated_at = now()
       where id = $1`,
      [ichchi.id, next.valence, next.arousal, next.stress, next.energy],
    );
    changed.set(ichchi.id, {
      mood: {
        valence: [ichchi.mood_valence, next.valence],
        stress: [ichchi.stress, next.stress],
      },
    });
    moodsAdjusted++;
  }

  // Bond decay, watermark-free: the increment is how much the *floor* of
  // accumulated decay moved over the last step, so repeat runs never
  // double-charge and the smallint column never sees the fractions.
  // f(t) = floor(0.5 · days_idle); applied = f(t) − f(t − step). Runs inside
  // the window apply nothing (inc = 0 rows are filtered out, so the log
  // stays honest); a window the cron slept through is simply lost.
  const bonds = await query<{ ichchi_id: string; bond: number }>(
    `update bonds b set bond = greatest(0, b.bond - s.inc)
      from (
        select ichchi_id, user_id,
          (floor(extract(epoch from now() - last_interaction_at) / 86400.0 * 0.5) -
           floor((extract(epoch from now() - last_interaction_at) / 86400.0 - ${STEP_DAYS}) * 0.5)
          )::int as inc
        from bonds
      ) s
     where b.ichchi_id = s.ichchi_id and b.user_id = s.user_id and s.inc > 0
     returning b.ichchi_id, b.bond`,
  );
  for (const b of bonds) {
    const entry = changed.get(b.ichchi_id) ?? {};
    changed.set(b.ichchi_id, { ...entry, bond: b.bond });
  }

  // Salience decay — the SQL mirror of salienceDecay() in lib/memory.ts:
  // half-life 14 days, stretched up to 2× by emotional charge. Fixed-step
  // per cron run; salience is real, so fractions survive.
  // The floor is what keeps a standard in force: everything else may fade to
  // an impression, but a rule the user laid down does not quietly expire.
  const memories = await query<{ ichchi_id: string }>(
    `update memories
        set salience = greatest(
              case when kind = 'standard' then ${STANDARD_SALIENCE_FLOOR} else 0 end,
              salience * power(0.5, ${STEP_DAYS} / (14.0 * (1 + least(1, abs(valence)))))
            )
      where salience > 0.01
        and (kind <> 'standard' or salience > ${STANDARD_SALIENCE_FLOOR})
      returning ichchi_id`,
  );
  const memoryCountByIchchi = new Map<string, number>();
  for (const m of memories) {
    memoryCountByIchchi.set(m.ichchi_id, (memoryCountByIchchi.get(m.ichchi_id) ?? 0) + 1);
  }
  for (const [ichchiId, n] of memoryCountByIchchi) {
    const entry = changed.get(ichchiId) ?? {};
    changed.set(ichchiId, { ...entry, memoriesFaded: n });
  }

  // The visible log: one decay line per ichchi that actually changed, with what
  // changed. Ichchi sitting exactly on their baseline produce nothing — the
  // log is for a person reading what the ichchi lived through.
  for (const [ichchiId, delta] of changed) {
    await query(`insert into ichchi_events (ichchi_id, kind, delta) values ($1, 'decay', $2)`, [
      ichchiId,
      JSON.stringify(delta),
    ]);
  }

  // Retention. Runs last so a failure here cannot cost a decay pass, and
  // never touches an event newer than the ichchi's last reflection — that is
  // the window reflect() is about to read, and pruning it would make the
  // ichchi reflect on a day with holes in it.
  const pruned = await query<{ id: string }>(
    `delete from ichchi_events e
      using ichchi i
      where e.ichchi_id = i.id
        and e.created_at < now() - make_interval(days => case e.kind
              when 'call' then ${RETAIN_DAYS.call}
              when 'decay' then ${RETAIN_DAYS.decay}
              when 'feedback' then ${RETAIN_DAYS.feedback}
              else ${RETAIN_DAYS.reflect} end)
        and e.created_at < coalesce(i.reflected_at, now())
      returning e.id`,
  );

  // Departure. Opt-in only, measured from the last time anybody touched the
  // ichchi — not from updated_at, which this very job moves every six hours
  // and would therefore keep resetting the clock forever.
  const departed = await query<{ id: string; name: string }>(
    `update ichchi i
        set departed_at = now()
      where i.mortal
        and i.departed_at is null
        and coalesce(
              (select max(b.last_interaction_at) from bonds b where b.ichchi_id = i.id),
              i.created_at
            ) < now() - interval '${DEPART_AFTER_DAYS} days'
     returning i.id, i.name`,
  );

  for (const d of departed) {
    // The last line in its own log, so the page can say when and why.
    await query(
      `insert into ichchi_events (ichchi_id, kind, text, delta) values ($1, 'decay', $2, $3)`,
      [
        d.id,
        `${d.name} departed after ${DEPART_AFTER_DAYS} days of silence`,
        JSON.stringify({ departed: true, afterDays: DEPART_AFTER_DAYS }),
      ],
    );
    console.log(`[decay] ${d.name} (${d.id}) departed`);
  }

  return {
    ichchi: rows.length,
    moodsAdjusted,
    bondsDecayed: bonds.length,
    memoriesDecayed: memories.length,
    eventsPruned: pruned.length,
    departed: departed.length,
  };
}

import { test, before } from "node:test";
import assert from "node:assert/strict";
import type { Ichchi, IchchiEvent } from "@/db/types";
import type {
  appendVoiceNote as appendVoiceNoteFn,
  applyReflection as applyReflectionFn,
  buildReflectPrompt as buildFn,
} from "./reflect";

/**
 * reflect.ts imports the database pool (env-validated), so the test sets a
 * placeholder DSN before touching it. A pg Pool connects lazily — importing
 * with a dead DSN is fine as long as no query runs, and none does here:
 * buildReflectPrompt and applyReflection are the pure core of the job.
 */
process.env.DATABASE_URL ??= "postgres://ichi:ichi@localhost:5433/ichi";

let buildReflectPrompt: typeof buildFn;
let applyReflection: typeof applyReflectionFn;
let appendVoiceNote: typeof appendVoiceNoteFn;
let VOICE_NOTES_MAX: number;

before(async () => {
  const mod = await import("./reflect");
  buildReflectPrompt = mod.buildReflectPrompt;
  applyReflection = mod.applyReflection;
  appendVoiceNote = mod.appendVoiceNote;
  VOICE_NOTES_MAX = mod.VOICE_NOTES_MAX;
});

function ichchiFixture(overrides: Partial<Ichchi> = {}): Ichchi {
  return {
    id: "00000000-0000-0000-0000-000000000001",
    owner_id: "user-1",
    slug: "ebe",
    name: "Эбэ",
    archetype: "ebe",
    openness: 85,
    conscientiousness: 50,
    extraversion: 25,
    agreeableness: 70,
    neuroticism: 60,
    mood_valence: -0.1,
    mood_arousal: 0,
    stress: 0.4,
    energy: 0.5,
    pending_drift: {},
    voice_notes: null,
    interactions: 42,
    reflected_at: null,
    public_slug: null,
    created_at: new Date("2026-08-01T00:00:00Z"),
    updated_at: new Date("2026-08-06T00:00:00Z"),
    ...overrides,
  };
}

function eventFixture(overrides: Partial<IchchiEvent> = {}): IchchiEvent {
  return {
    id: "00000000-0000-0000-0000-000000000002",
    ichchi_id: "00000000-0000-0000-0000-000000000001",
    user_id: "user-1",
    kind: "feedback",
    tool: "ichchi_feedback",
    text: "broke the build",
    signal: "scold",
    delta: {},
    created_at: new Date("2026-08-06T10:00:00Z"),
    ...overrides,
  };
}

test("buildReflectPrompt names the ichchi, its traits and every event", () => {
  const ichchi = ichchiFixture();
  const events = [
    eventFixture(),
    eventFixture({ kind: "call", tool: "ichchi_brief", signal: null, text: null }),
  ];

  const prompt = buildReflectPrompt(ichchi, events);

  assert.ok(prompt.includes("Эбэ"));
  assert.ok(prompt.includes("neuroticism 60"));
  // The archetype's voice stands in when the ichchi has no notes of its own.
  assert.ok(prompt.includes("Quiet, flowing"));
  assert.ok(prompt.includes("scold: broke the build"));
  assert.ok(prompt.includes("call/ichchi_brief"));
  // Oldest first — reflection reads a day in order, not as a pile.
  assert.ok(prompt.indexOf("scold") < prompt.indexOf("call/ichchi_brief"));
});

test("applyReflection commits drift past the threshold and carries the rest", () => {
  const ichchi = ichchiFixture({ pending_drift: { neuroticism: 1.8 } });
  const applied = applyReflection(ichchi, {
    sentiment: -0.5,
    drift: { neuroticism: 0.5, agreeableness: -0.4 },
    memories: [],
    voice_note: "",
  });

  // 1.8 + 0.5 = 2.3 crosses the commit threshold of 2; agreeableness −0.4
  // stays pending for the next round.
  assert.equal(applied.traits.neuroticism, 62);
  assert.equal(applied.traits.agreeableness, 70);
  assert.deepEqual(applied.committed, { neuroticism: 2.3 });
  assert.deepEqual(applied.remaining, { agreeableness: -0.4 });
});

test("applyReflection appends a formed belief without dropping old ones", () => {
  const ichchi = ichchiFixture({ voice_notes: "Speaks of rivers." });
  const applied = applyReflection(ichchi, {
    sentiment: 0,
    drift: {},
    memories: [],
    voice_note: "  Distrusts Friday deploys.  ",
  });
  assert.equal(applied.voiceNotes, "Speaks of rivers. · Distrusts Friday deploys.");

  const unchanged = applyReflection(ichchi, {
    sentiment: 0,
    drift: {},
    memories: [],
    voice_note: "   ",
  });
  assert.equal(unchanged.voiceNotes, "Speaks of rivers.");
});

/**
 * The regression that matters most in this file. The old implementation
 * appended and truncated the tail, so once voice_notes saturated the ichchi
 * silently stopped forming convictions — forever, and with nothing in the
 * logs to show it. This asserts the opposite: the newest conviction is always
 * present, and the cost of that is the oldest one falling off.
 */
test("appendVoiceNote keeps the newest conviction and evicts the oldest", () => {
  const long = Array.from({ length: 24 }, (_, i) => `Conviction number ${i}.`).join(" · ");
  assert.ok(long.length > VOICE_NOTES_MAX, "fixture must actually overrun the cap");

  const out = appendVoiceNote(long, "Never deploys on a Friday.") ?? "";

  assert.ok(out.includes("Never deploys on a Friday."), "the new conviction survives");
  assert.ok(!out.includes("Conviction number 0."), "the oldest conviction is evicted");
  assert.ok(out.length <= VOICE_NOTES_MAX, "the result respects the cap");
});

test("appendVoiceNote keeps a single oversized note rather than dropping it", () => {
  const huge = "x".repeat(VOICE_NOTES_MAX + 50);
  const out = appendVoiceNote(null, huge) ?? "";
  assert.equal(out.length, VOICE_NOTES_MAX);
});

test("applyReflection clamps committed traits to 0..100", () => {
  const ichchi = ichchiFixture({ neuroticism: 99, pending_drift: { neuroticism: 5 } });
  const applied = applyReflection(ichchi, {
    sentiment: 0,
    drift: {},
    memories: [],
    voice_note: "",
  });
  assert.equal(applied.traits.neuroticism, 100);
});

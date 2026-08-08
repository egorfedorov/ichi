import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/session";
import { archetypeById, descendFrom, getPublicIchi } from "@/lib/ichi";

export const dynamic = "force-dynamic";
export const metadata = { title: "Take a descendant — ichi" };

interface Props {
  params: Promise<{ slug: string }>;
}

/**
 * Taking a descendant of somebody else's published ichi.
 *
 * Lives behind the session for the same reason joining does: this creates a
 * row owned by a person, and the person has to be the one asking.
 *
 * A form rather than a link that acts on GET. A descendant is a real object
 * with a name the keeper picks, and a crawler following a link should never
 * be able to birth one.
 */
export default async function DescendPage({ params }: Props) {
  const { slug } = await params;
  const user = await currentUser();
  if (!user) redirect(`/sign-in`);

  const parent = await getPublicIchi(slug);
  if (!parent) {
    return (
      <main className="mx-auto w-full max-w-xl px-6 py-16">
        <h1 className="text-2xl font-semibold text-snow">No such ichi</h1>
        <p className="mt-3 text-sm text-snow-2">
          The page is private, or the link never existed.
        </p>
        <Link href="/ichi" className="mt-8 inline-block text-sm text-frost">
          ← your ichi
        </Link>
      </main>
    );
  }

  async function create(formData: FormData) {
    "use server";
    const me = await currentUser();
    if (!me) redirect("/");
    const raw = String(formData.get("name") ?? "").trim();
    if (raw.length < 2 || raw.length > 40) return;
    const child = await descendFrom(slug, me.id, raw.slice(0, 40));
    redirect(`/ichi/${child.slug}`);
  }

  return (
    <main className="mx-auto w-full max-w-xl px-6 py-16">
      <h1 className="text-2xl font-semibold text-snow">
        A descendant of {parent.name}
      </h1>
      <p className="mt-3 text-sm leading-relaxed text-snow-2">
        It inherits the character {parent.name} actually grew into:{" "}
        <span className="font-mono text-frost">
          O{parent.openness} C{parent.conscientiousness} E{parent.extraversion} A
          {parent.agreeableness} N{parent.neuroticism}
        </span>
        {parent.voice_notes ? ` — and the voice: “${parent.voice_notes}”` : ""}. Still
        descended from the archetype{" "}
        {archetypeById(parent.archetype)?.name ?? parent.archetype}.
      </p>
      <p className="mt-3 text-sm leading-relaxed text-snow-3">
        Memory is not inherited. It meets you as a stranger — with a formed
        temperament, and not one of somebody else’s memories.
      </p>

      <form action={create} className="mt-8">
        <label htmlFor="name" className="block text-sm text-snow-2">
          Its name
        </label>
        <input
          id="name"
          name="name"
          required
          minLength={2}
          maxLength={40}
          defaultValue={parent.name}
          className="mt-2 w-full rounded-md border border-rule bg-night-2 px-3 py-2 text-sm text-snow outline-none focus:border-snow-3"
        />
        <button
          type="submit"
          className="mt-4 cursor-pointer rounded-md border border-snow-3 px-4 py-2 text-sm text-snow hover:border-snow"
        >
          Take it
        </button>
      </form>
    </main>
  );
}

import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/session";
import { archetypeById, descendFrom, getPublicIchchi } from "@/lib/ichchi";

export const dynamic = "force-dynamic";
export const metadata = { title: "Взять потомка — иччи" };

interface Props {
  params: Promise<{ slug: string }>;
}

/**
 * Taking a descendant of somebody else's published ichchi.
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
  if (!user) redirect(`/sign-in?next=${encodeURIComponent(`/descend/${slug}`)}`);

  const parent = await getPublicIchchi(slug);
  if (!parent) {
    return (
      <main className="mx-auto w-full max-w-xl px-6 py-16">
        <h1 className="text-2xl font-semibold text-snow">Иччи не найден</h1>
        <p className="mt-3 text-sm text-snow-2">
          Страница закрыта или ссылки никогда не было.
        </p>
        <Link href="/ichchi" className="mt-8 inline-block text-sm text-frost">
          ← мои иччи
        </Link>
      </main>
    );
  }

  async function create(formData: FormData) {
    "use server";
    const me = await currentUser();
    if (!me) redirect("/sign-in");
    const raw = String(formData.get("name") ?? "").trim();
    if (raw.length < 2 || raw.length > 40) return;
    const child = await descendFrom(slug, me.id, raw.slice(0, 40));
    redirect(`/ichchi/${child.slug}`);
  }

  return (
    <main className="mx-auto w-full max-w-xl px-6 py-16">
      <h1 className="text-2xl font-semibold text-snow">
        Потомок {parent.name}
      </h1>
      <p className="mt-3 text-sm leading-relaxed text-snow-2">
        Унаследует характер, в который {parent.name} вырос:{" "}
        <span className="font-mono text-frost">
          O{parent.openness} C{parent.conscientiousness} E{parent.extraversion} A
          {parent.agreeableness} N{parent.neuroticism}
        </span>
        {parent.voice_notes ? ` — и голос: «${parent.voice_notes}»` : ""}. Родом
        всё ещё из архетипа{" "}
        {archetypeById(parent.archetype)?.name ?? parent.archetype}.
      </p>
      <p className="mt-3 text-sm leading-relaxed text-snow-3">
        Память не наследуется. Потомок встретит тебя незнакомцем — со
        сложившимся нравом, но без единого чужого воспоминания.
      </p>

      <form action={create} className="mt-8">
        <label htmlFor="name" className="block text-sm text-snow-2">
          Имя потомка
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
          Принять потомка
        </button>
      </form>
    </main>
  );
}

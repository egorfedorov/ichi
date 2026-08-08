import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/session";
import { archetypeById, joinByCode } from "@/lib/ichchi";

export const dynamic = "force-dynamic";

export const metadata = { title: "Присоединиться к иччи" };

interface Props {
  params: Promise<{ code: string }>;
}

/**
 * Accepting a team invitation.
 *
 * Joining happens here rather than over MCP on purpose. The MCP surface is
 * authenticated by a bearer token that already names one user, so "join this
 * ichchi" through an agent would mean an agent silently widening its own
 * access. On the web the person is signed in and clicked the link themselves,
 * which is what an invitation should require.
 *
 * A signed-out visitor is sent to sign in and back — losing the invite because
 * you happened to be logged out is the easiest way to waste an invitation.
 */
export default async function JoinPage({ params }: Props) {
  const { code } = await params;
  const user = await currentUser();
  if (!user) redirect(`/sign-in?next=${encodeURIComponent(`/join/${code}`)}`);

  const ichchi = await joinByCode(user.id, code);

  return (
    <main className="mx-auto w-full max-w-xl px-6 py-16">
      {ichchi ? (
        <>
          <h1 className="text-2xl font-semibold text-snow">
            Теперь ты работаешь с {ichchi.name}
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-snow-2">
            {archetypeById(ichchi.archetype)?.name ?? ichchi.archetype}. Иччи общий:
            стандарты, которые он помнит, действуют во всех сессиях команды. А связь
            у него с каждым своя — с тобой она начинается с нуля.
          </p>
          <p className="mt-6 text-sm text-snow-2">
            В агенте вызови <code className="font-mono text-frost">ichchi_brief</code> со
            слагом <code className="font-mono text-frost">{ichchi.slug}</code>.
          </p>
          <Link
            href={`/ichchi/${ichchi.slug}`}
            className="mt-8 inline-block rounded-md border border-snow-3 px-4 py-2 text-sm text-snow hover:border-snow"
          >
            Открыть страницу иччи
          </Link>
        </>
      ) : (
        <>
          <h1 className="text-2xl font-semibold text-snow">Приглашение не действует</h1>
          <p className="mt-3 text-sm leading-relaxed text-snow-2">
            Ссылку отозвали или её никогда не было. Попроси владельца иччи выпустить
            новую.
          </p>
          <Link
            href="/ichchi"
            className="mt-8 inline-block rounded-md border border-snow-3 px-4 py-2 text-sm text-snow hover:border-snow"
          >
            ← мои иччи
          </Link>
        </>
      )}
    </main>
  );
}

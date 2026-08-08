import { redirect } from "next/navigation";
import { query } from "@/db";
import type { Ichchi } from "@/db/types";
import { currentUser } from "@/lib/session";
import { ARCHETYPES } from "@/lib/ichchi";
import IchchiCard from "@/components/IchchiCard";
import AdoptForm from "@/components/AdoptForm";

export const dynamic = "force-dynamic";

export const metadata = { title: "Мои души — иччи" };

interface IchchiRow extends Ichchi {
  bond: number | null;
  memory_count: string;
}

/**
 * The owner's shelf of ichchi. One joined query — bond and memory count ride
 * along, so the cards render without per-row fetches.
 */
export default async function IchchiListPage() {
  const user = await currentUser();
  if (!user) redirect("/sign-in?next=/ichchi");

  const ichchi = await query<IchchiRow>(
    `select s.*, b.bond,
            (select count(*) from memories m where m.ichchi_id = s.id) as memory_count
       from ichchi s
       left join bonds b on b.ichchi_id = s.id and b.user_id = $1
      where s.owner_id = $1
      order by s.created_at asc`,
    [user.id],
  );

  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-12">
      <h1 className="text-2xl font-semibold">Мои души</h1>

      {ichchi.length === 0 ? (
        <p className="mt-4 max-w-md text-sm leading-relaxed text-snow-2">
          Пока ни одной. Призови первую — выбери духа, дай имя, и он появится
          здесь со своим характером.
        </p>
      ) : (
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {ichchi.map((s) => (
            <IchchiCard
              key={s.id}
              ichchi={s}
              bond={s.bond}
              memoryCount={Number(s.memory_count)}
            />
          ))}
        </div>
      )}

      <div className="mt-8 max-w-md">
        <AdoptForm archetypes={ARCHETYPES} />
      </div>
    </main>
  );
}

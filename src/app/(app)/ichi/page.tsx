import { redirect } from "next/navigation";
import { query } from "@/db";
import type { Ichi } from "@/db/types";
import { currentUser } from "@/lib/session";
import { ARCHETYPES } from "@/lib/ichi";
import IchiCard from "@/components/IchiCard";
import AdoptForm from "@/components/AdoptForm";

export const dynamic = "force-dynamic";

export const metadata = { title: "Мои ичи" };

interface IchiRow extends Ichi {
  bond: number | null;
  memory_count: string;
}

/**
 * The owner's shelf of ichi. One joined query — bond and memory count ride
 * along, so the cards render without per-row fetches.
 */
export default async function IchiListPage() {
  const user = await currentUser();
  if (!user) redirect("/sign-in?next=/ichi");

  const ichi = await query<IchiRow>(
    `select s.*, b.bond,
            (select count(*) from memories m where m.ichi_id = s.id) as memory_count
       from ichi s
       left join bonds b on b.ichi_id = s.id and b.user_id = $1
      where s.owner_id = $1
      order by s.created_at asc`,
    [user.id],
  );

  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-12">
      <h1 className="text-2xl font-semibold">Мои ичи</h1>

      {ichi.length === 0 ? (
        <p className="mt-4 max-w-md text-sm leading-relaxed text-snow-2">
          Пока ни одной. Призови первую — выбери духа, дай имя, и он появится
          здесь со своим характером.
        </p>
      ) : (
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {ichi.map((s) => (
            <IchiCard
              key={s.id}
              ichi={s}
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

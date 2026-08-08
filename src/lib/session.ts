import { headers } from "next/headers";
import { auth } from "@/lib/auth";

export interface SessionUser {
  id: string;
  email: string;
  name: string | null;
  image: string | null;
}

function shape(
  sessionUser: Record<string, unknown> & { id: string; email: string },
): SessionUser {
  return {
    id: sessionUser.id,
    email: sessionUser.email,
    name: (sessionUser.name as string | null) ?? null,
    image: (sessionUser.image as string | null) ?? null,
  };
}

/** Current user, or null. Safe to call from any server component. */
export async function currentUser(): Promise<SessionUser | null> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return null;
  return shape(session.user as unknown as Record<string, unknown> & { id: string; email: string });
}

/** For route handlers, where `headers()` is not available. */
export async function requireUser(req: Request): Promise<SessionUser> {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session?.user) throw new Error("unauthorized");
  return shape(session.user as unknown as Record<string, unknown> & { id: string; email: string });
}

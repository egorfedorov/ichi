import { NextResponse } from "next/server";

// Liveness probe for the compose healthcheck and deploy scripts. Deliberately
// does not touch the database — a slow Postgres should not get the app
// restarted out from under in-flight requests.
export function GET() {
  return NextResponse.json({ ok: true });
}

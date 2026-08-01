import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { seasons } from "@/db/schema";
import { currentContext, can } from "@/lib/auth";
import { exportRegistrationsCsv } from "@/lib/registration";

/**
 * The registrar's CSV. Behind the session, scoped to a season in the caller's own
 * club, and never containing a medical note — this file gets emailed around and
 * printed at a field.
 */
export async function GET(req: Request): Promise<Response> {
  const ctx = await currentContext();
  if (!ctx) return new Response("Sign in first", { status: 401 });
  if (!can(ctx.user.role, "manage_money") && !can(ctx.user.role, "manage_rosters")) {
    return new Response("Your role cannot export registrations", { status: 403 });
  }

  const seasonId = new URL(req.url).searchParams.get("season") ?? "";
  const [season] = await getDb().select().from(seasons).where(eq(seasons.id, seasonId));
  if (!season || season.clubId !== ctx.club.id) {
    return new Response("No such season", { status: 404 });
  }

  const csv = await exportRegistrationsCsv(seasonId);
  const filename = `${season.slug}-registrations.csv`;
  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
      "cache-control": "no-store",
    },
  });
}

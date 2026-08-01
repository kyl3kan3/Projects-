import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { teams, teamStaff } from "@/db/schema";
import { currentContext, isTeamScoped } from "@/lib/auth";
import { exportRosterCsv } from "@/lib/rosters";

/**
 * The sideline roster: jersey numbers and names, nothing else. A coach may export
 * their own team; a registrar any team in the club. Medical notes and parent
 * contact details are not in this file for anybody — it is printed and left on a
 * bench.
 */
export async function GET(req: Request): Promise<Response> {
  const ctx = await currentContext();
  if (!ctx) return new Response("Sign in first", { status: 401 });

  const teamId = new URL(req.url).searchParams.get("team") ?? "";
  const db = getDb();
  const [team] = await db.select().from(teams).where(eq(teams.id, teamId));
  if (!team || team.clubId !== ctx.club.id) return new Response("No such team", { status: 404 });

  if (isTeamScoped(ctx.user.role)) {
    const mine = await db
      .select({ teamId: teamStaff.teamId })
      .from(teamStaff)
      .where(eq(teamStaff.userId, ctx.user.id));
    if (!mine.some((m) => m.teamId === teamId)) {
      return new Response("That is not one of your teams", { status: 403 });
    }
  }

  const csv = await exportRosterCsv(teamId);
  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${team.name.toLowerCase().replace(/\s+/g, "-")}-roster.csv"`,
      "cache-control": "no-store",
    },
  });
}

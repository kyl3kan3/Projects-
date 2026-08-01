import { buildTeamFeed } from "@/lib/ical";
import { resolveTeamFeedToken } from "@/lib/links";

export const dynamic = "force-dynamic";

/**
 * A team's calendar feed.
 *
 * Signed per team so the URLs cannot be enumerated, and it contains published
 * games only — venue, field and time. No child's name, no contact detail, nothing
 * about money: this URL gets pasted into shared calendars and forwarded around a
 * team's parents, so it holds the minimum that makes it useful.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ token: string }> },
): Promise<Response> {
  const { token } = await params;
  const teamId = await resolveTeamFeedToken(token.replace(/\.ics$/, ""));
  if (!teamId) {
    return new Response("That calendar link is not valid", { status: 404 });
  }
  const feed = await buildTeamFeed(teamId);
  if (!feed) return new Response("No such team", { status: 404 });

  return new Response(feed.ics, {
    headers: {
      "content-type": "text/calendar; charset=utf-8",
      "content-disposition": `inline; filename="${feed.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.ics"`,
      // 15 minutes, per ARCHITECTURE.md: a schedule change should reach a phone
      // quickly, and a feed re-fetched every minute by every parent is rude.
      "cache-control": "public, max-age=900",
    },
  });
}

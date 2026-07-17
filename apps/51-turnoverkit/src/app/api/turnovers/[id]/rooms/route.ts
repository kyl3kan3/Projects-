/**
 * src/app/api/turnovers/[id]/rooms/route.ts
 *
 * Room-check progress from the cleaner job page (ARCHITECTURE.md flow 2).
 * Progress persists server-side per room so a dropped connection resumes
 * exactly where the cleaner left off.
 *
 * TODO:
 * - [ ] Auth: job token (Authorization header) must resolve to this
 *       turnover; 401 otherwise.
 * - [ ] PATCH body (zod): { roomKey, tasksDone?, markDone?, photoKeys? }.
 * - [ ] markDone enforces the photo gate SERVER-SIDE: count of confirmed
 *       verification photos for the room >= required_photos, else 422
 *       with { unmetRoom, needed } -- the gate is structural, not
 *       honor-system.
 * - [ ] photoKeys confirm previously issued uploads -> photos rows.
 * - [ ] First activity stamps turnovers.started_at and flips status to
 *       in_progress (board tile update).
 * - [ ] GET returns the turnover's room_checks + progress summary for
 *       resume ("3 of 5 rooms · 7 photos").
 */

export async function GET(
  _req: Request,
  _ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  return new Response("Not implemented", { status: 501 });
}

export async function PATCH(
  _req: Request,
  _ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  return new Response("Not implemented", { status: 501 });
}

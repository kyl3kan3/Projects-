/**
 * /api/pursuits
 *
 * GET  — list the firm's pursuits by stage (query: ?stage=drafting).
 * POST — create a pursuit: from a match (marks it "pursued", copies the
 *        notice's dates into deadlines) or manual (title only — enterprise
 *        RFPs that never hit a portal).
 *
 * TODO:
 * - [ ] requireFirm() on both verbs; zod-validate the POST body
 *       ({ matchId? , title?, valueCents? } — exactly one origin).
 * - [ ] From-match path: set matches.state = "pursued", create
 *       deadlines rows for questions/proposal dates, stage "go_no_go".
 * - [ ] audit_log the creation.
 */

export async function GET(request: Request): Promise<Response> {
  void request;
  return new Response("Not implemented", { status: 501 });
}

export async function POST(request: Request): Promise<Response> {
  void request;
  return new Response("Not implemented", { status: 501 });
}

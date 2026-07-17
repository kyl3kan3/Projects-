/**
 * POST /api/sets — the outbox's target.
 *
 * zod body = LogSetInput; requireClient(); upsert by idempotency_key
 * (logging.logSet). Returns 200 with the row id — the outbox removes
 * its entry on any 2xx, so this endpoint MUST be idempotent.
 */

export async function POST(request: Request): Promise<Response> {
  void request;
  return new Response("Not implemented", { status: 501 });
}

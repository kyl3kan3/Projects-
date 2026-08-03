/**
 * Outbox ingestion. The crew PWA posts here; the crew token is the authorisation,
 * which is why middleware deliberately does not cover this path — the phone has
 * no cookie and never will.
 *
 * Idempotent per (instance, employee): a retry, a double-tap, or a second phone
 * at the same huddle produces one signature per person. See `lib/signoff.ts` for
 * the guarantees.
 */

import { ingestSync, syncPayloadSchema, SyncError } from "@/lib/signoff";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Expected a JSON body" }, { status: 400 });
  }

  const parsed = syncPayloadSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      {
        error: "That sync payload is not valid.",
        // The device needs to know which field to stop sending, and a foreman
        // needs the page to keep working; the outbox keeps its entries either way.
        issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      },
      { status: 400 },
    );
  }

  try {
    const result = await ingestSync(parsed.data);
    return Response.json(result, { headers: { "cache-control": "no-store" } });
  } catch (err) {
    if (err instanceof SyncError) {
      return Response.json({ error: err.message, code: err.code }, { status: err.status });
    }
    console.error("[sync] failed", err);
    return Response.json(
      { error: "The office could not file these signatures. They are still saved on this phone." },
      { status: 500 },
    );
  }
}

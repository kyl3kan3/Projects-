/**
 * src/app/api/inspections/route.ts
 *
 * Inspection submission endpoint for the driver PWA (ARCHITECTURE.md
 * flow 1, step 5). The offline sync target: exactly-once by client
 * draft id.
 *
 * TODO:
 * - [ ] Auth: driver token (Authorization header); the vehicle must
 *       belong to the driver's fleet; 401/403 otherwise.
 * - [ ] POST body (zod): SubmitInspectionInput from lib/inspections --
 *       clientDraftId, vehicle, template, kind, odometer, items with
 *       results/notes/photoKeys, signature, duration.
 * - [ ] submitInspection(): photo-on-fail and odometer sanity enforced
 *       server-side; upsert by client_draft_id -- a retried offline sync
 *       returns the same inspection id with 200, never a duplicate.
 * - [ ] On first successful persist: enqueue process-inspection
 *       (defect promotion, OOS rules, tickets, notifications).
 * - [ ] 422 responses name the failing item ("brakes: photo required")
 *       so the PWA can reopen the exact row.
 */

export async function POST(_req: Request): Promise<Response> {
  return new Response("Not implemented", { status: 501 });
}

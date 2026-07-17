/**
 * src/app/api/uploads/route.ts
 *
 * Signed-PUT issuance for photo uploads (ARCHITECTURE.md: R2, signed
 * URLs only). Called by the cleaner job page (job-token auth) and the
 * host dashboard (session auth).
 *
 * TODO:
 * - [ ] POST body (zod): { turnoverId?, roomCheckId?, issueId?, kind,
 *       contentType } -- images only, size cap enforced via presigned
 *       conditions.
 * - [ ] Auth: accept EITHER a valid session user (host side) OR a valid
 *       job token whose turnoverId matches the request (cleaner side);
 *       401 otherwise.
 * - [ ] Key scheme: {hostId}/{unitId}/{turnoverId}/{uuid}.jpg -- never
 *       client-chosen keys.
 * - [ ] Return { uploadUrl, storageKey, expiresIn }; the client PUTs the
 *       client-side-compressed JPEG directly to R2.
 * - [ ] A separate confirm step (or the room-complete mutation) writes
 *       the photos row -- an issued URL alone never creates evidence.
 */

export async function POST(_req: Request): Promise<Response> {
  return new Response("Not implemented", { status: 501 });
}

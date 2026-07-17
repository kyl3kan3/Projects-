/**
 * src/app/api/uploads/route.ts
 *
 * Signed-PUT issuance for photo uploads (ARCHITECTURE.md: R2, signed
 * URLs only). Called by the driver inspection PWA (driver-token auth)
 * and the office dashboard (session auth).
 *
 * TODO:
 * - [ ] POST body (zod): { inspectionItemRef?, workOrderId?, vehicleId,
 *       contentType } -- images only, size cap enforced via presigned
 *       conditions.
 * - [ ] Auth: accept EITHER a valid session user (office side) OR a
 *       valid driver token whose fleet matches the vehicle (driver
 *       side); 401 otherwise.
 * - [ ] Key scheme: {fleetId}/{vehicleId}/{yyyy-mm}/{uuid}.jpg -- never
 *       client-chosen keys.
 * - [ ] Return { uploadUrl, storageKey, expiresIn }; the client PUTs the
 *       client-side-compressed JPEG directly to R2.
 * - [ ] Photos rows are written by the submission/mutation that confirms
 *       them -- an issued URL alone never creates evidence.
 */

export async function POST(_req: Request): Promise<Response> {
  return new Response("Not implemented", { status: 501 });
}

/**
 * POST /api/uploads
 *
 * R2 presigned upload URLs for cab photos (POD, fuel receipts) and
 * office PDFs. The client PUTs directly to R2; this route only mints
 * the URL and records intent.
 *
 * TODO:
 * - [ ] requireSession(); zod body { kind, loadId?, filename,
 *       contentType, sizeBytes } with size/type limits (photos <= 12MB,
 *       pdf <= 25MB).
 * - [ ] Key scheme: {carrierId}/{loadId ?? "misc"}/{uuid}-{filename}.
 * - [ ] Follow-up POST /api/uploads/complete writes the documents row.
 */

export async function POST(request: Request): Promise<Response> {
  void request;
  return new Response("Not implemented", { status: 501 });
}

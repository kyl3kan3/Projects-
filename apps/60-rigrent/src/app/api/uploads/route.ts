/**
 * POST /api/uploads
 *
 * R2 presigned upload URLs for condition photos (driver phones) and
 * contract PDFs. Client PUTs directly to R2.
 *
 * TODO: requireSession(); zod body { kind: "condition_photo" | "doc",
 * checkId?, filename, contentType, sizeBytes } (photos <= 12MB); key
 * scheme {accountId}/{orderId}/{checkId}/{uuid}.jpg; completion
 * endpoint writes condition_photos row.
 */

export async function POST(request: Request): Promise<Response> {
  void request;
  return new Response("Not implemented", { status: 501 });
}

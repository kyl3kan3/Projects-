/**
 * src/app/api/pages/route.ts
 *
 * Track-a-page endpoint (ARCHITECTURE.md flow 1): the extraction
 * preview, then confirmation.
 *
 * TODO:
 * - [ ] Auth: requireUser(); the product must belong to the session's
 *       brand.
 * - [ ] POST body (zod): { productId, url, label } with mode=preview |
 *       confirm.
 * - [ ] preview: one polite fetch through the domain limiter (creating
 *       the scrape_domains row if new), run the extraction cascade,
 *       return { priceCents, currency, inStock, method, rawPriceString }
 *       WITHOUT persisting a page -- "we read $84.99, in stock.
 *       Correct?"
 * - [ ] confirm: create competitor_pages + the first snapshot + a
 *       first_read change event; schedule next_check_at; enforce the
 *       plan's tracked-SKU limit with an upgrade prompt payload (409),
 *       never a silent block.
 * - [ ] fix-the-read: accept a user-picked selector; store it on the
 *       page (manual method) and merge into the domain selector pack.
 */

export async function POST(_req: Request): Promise<Response> {
  return new Response("Not implemented", { status: 501 });
}

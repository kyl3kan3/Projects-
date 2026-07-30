/**
 * src/app/(dashboard)/dashboard/page.tsx
 *
 * The Reorder screen -- ShelfSense's money screen (DESIGN.md "Mobile
 * layout: Reorder (home)"). Embedded in the Shopify admin via App
 * Bridge; authenticated by session token.
 *
 * TODO:
 * - [ ] At-risk stat block: REVENUE AT RISK · 30D over the mono dollar
 *       figure, with the per-SKU breakdown line beneath.
 * - [ ] Status chip row (Order now / Soon / Healthy / Dead) filtering
 *       the list; crossfade 150ms.
 * - [ ] SKU rows grouped under ORDER NOW / ORDER THIS WEEK / HEALTHY
 *       labels: status dot, title, mono facts line, order-by date right.
 * - [ ] The runway on row expand (SKU detail route on mobile).
 * - [ ] Signature: runway re-draw + kraft underline sweep on sync
 *       (DESIGN.md "The signature"); reduced-motion fallback.
 * - [ ] Pinned primary button: "Draft POs (n SKUs)".
 * - [ ] Empty state (backfill running): progress with real counts
 *       ("Imported 3,120 of ~8,400 orders"); no placeholder bars.
 * - [ ] Loading/error states per DESIGN.md; App Bridge navigation.
 */

export default function DashboardPage() {
  return null; // TODO: implement
}

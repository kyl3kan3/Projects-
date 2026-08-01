/**
 * The widget's read path — the one query in this product that runs at storefront
 * scale, and the reason the app is fast enough to market on speed.
 *
 * Shape of the path (ARCHITECTURE.md flow 3):
 *
 *   storefront -> CDN edge (s-maxage=300, stale-while-revalidate=86400)
 *              -> this function, wrapped in Next's data cache, tagged per store
 *              -> Postgres, one indexed query
 *
 * So a cache hit never reaches here at all; a miss inside the same deployment
 * still usually hits the data cache; only a tag revalidation reaches Postgres.
 * Approving or hiding a review calls `revalidateStoreReviews`, which is why a
 * moderation decision is live in seconds rather than after the 5-minute TTL.
 *
 * Everything returned is JSON-ready — strings and numbers, no Date objects — both
 * because it is literally the response body and because the data cache should not
 * be storing class instances.
 */

import { and, desc, eq, inArray } from "drizzle-orm";
import { unstable_cache, revalidateTag } from "next/cache";
import { getDb } from "@/db";
import { reviewMedia, reviews, widgetSettings, widgets, type Store, type Tier } from "@/db/schema";
import { isoDate, shortDate } from "@/lib/format";
import { photoUrl } from "@/lib/media";
import { featureAllowed, resolveBranding, widgetTypeAllowed } from "@/lib/plans";
import { aggregateFor } from "@/lib/reviews";
import { defaultLayout, defaultTheme } from "@/lib/widgets";
import type { WidgetPayload, WidgetReview } from "@/widget/types";

/** Cache tag for everything a store's widgets read. */
export function storeReviewsTag(storeId: string): string {
  return `store-reviews:${storeId}`;
}

/** Called by every moderation action: the edge must never serve a hidden review. */
export function revalidateStoreReviews(storeId: string): void {
  revalidateTag(storeReviewsTag(storeId));
}

/** How long the edge may serve a response, and the SWR window behind it. */
export const WIDGET_CACHE_CONTROL =
  "public, max-age=0, s-maxage=300, stale-while-revalidate=86400";

/** Next's own data cache TTL, behind the CDN. */
const DATA_CACHE_SECONDS = 300;

export interface PayloadRequest {
  store: Store;
  tier: Tier;
  widgetId?: string | null;
  productExternalId?: string | null;
}

async function buildPayload(req: PayloadRequest): Promise<WidgetPayload> {
  const { store, tier } = req;
  const db = getDb();

  // Resolve the widget instance. An unknown or foreign id falls back to a wall
  // with default tokens rather than failing: a broken snippet on a live
  // storefront should still show the reviews.
  let widgetRow =
    req.widgetId
      ? (
          await db
            .select({ widget: widgets, settings: widgetSettings })
            .from(widgets)
            .innerJoin(widgetSettings, eq(widgetSettings.widgetId, widgets.id))
            .where(and(eq(widgets.id, req.widgetId), eq(widgets.storeId, store.id)))
        )[0]
      : undefined;

  if (!widgetRow) {
    const [fallback] = await db
      .select({ widget: widgets, settings: widgetSettings })
      .from(widgets)
      .innerJoin(widgetSettings, eq(widgetSettings.widgetId, widgets.id))
      .where(eq(widgets.storeId, store.id))
      .orderBy(desc(widgets.createdAt))
      .limit(1);
    widgetRow = fallback;
  }

  const type = widgetRow?.widget.type ?? "badge";
  const theme = widgetRow?.settings.theme ?? defaultTheme();
  const layout = widgetRow?.settings.layout ?? defaultLayout(type);

  // A downgrade does not delete a widget; it stops the disallowed type rendering
  // and falls back to the badge, which every tier has.
  const allowedType = widgetTypeAllowed(tier, type) ? type : "badge";
  const showPhotos = layout.showPhotos && featureAllowed(tier, "photoReviews");

  const aggregate = await aggregateFor(store.id, req.productExternalId ?? null);

  // The badge and star snippet only need the aggregate, so they never pay for the
  // review rows or the media join.
  const needsRows = allowedType === "wall" || allowedType === "carousel";
  let list: WidgetReview[] = [];

  if (needsRows) {
    const rows = await db
      .select()
      .from(reviews)
      .where(
        and(
          eq(reviews.storeId, store.id),
          eq(reviews.status, "approved"),
          req.productExternalId ? eq(reviews.productExternalId, req.productExternalId) : undefined,
        ),
      )
      .orderBy(desc(reviews.publishedAt), desc(reviews.createdAt))
      .limit(Math.min(48, Math.max(1, layout.maxReviews)));

    const mediaByReview = new Map<string, { url: string; width: number; height: number }[]>();
    if (showPhotos && rows.length) {
      const media = await db
        .select()
        .from(reviewMedia)
        .where(
          and(
            inArray(
              reviewMedia.reviewId,
              rows.map((r) => r.id),
            ),
            eq(reviewMedia.moderationStatus, "approved"),
          ),
        );
      for (const m of media) {
        const bucket = mediaByReview.get(m.reviewId) ?? [];
        bucket.push({ url: photoUrl(m), width: m.width, height: m.height });
        mediaByReview.set(m.reviewId, bucket);
      }
    }

    list = rows.map((row) => ({
      id: row.id,
      rating: row.rating,
      title: row.title,
      body: row.body,
      author: row.authorName,
      verified: row.verifiedPurchase,
      date: shortDate(row.publishedAt ?? row.createdAt),
      dateIso: isoDate(row.publishedAt ?? row.createdAt),
      product: row.productTitle,
      reply: layout.showReplies ? row.reply : null,
      photos: mediaByReview.get(row.id) ?? [],
      // Present only on incentivised reviews, and never optional (FTC).
      disclosure: row.incentiveCode ? row.incentiveDisclosure : null,
    }));
  }

  // The JSON-LD needs a product name when the payload is scoped to one, and the
  // badge and star snippet never load review rows to get it from.
  let productTitle: string | null = list.find((r) => r.product)?.product ?? null;
  if (req.productExternalId && !productTitle) {
    const [named] = await db
      .select({ title: reviews.productTitle })
      .from(reviews)
      .where(
        and(
          eq(reviews.storeId, store.id),
          eq(reviews.productExternalId, req.productExternalId),
          eq(reviews.status, "approved"),
        ),
      )
      .limit(1);
    productTitle = named?.title ?? null;
  }

  return {
    store: { name: store.name, url: store.domain ? `https://${store.domain}` : null },
    widget: {
      id: widgetRow?.widget.id ?? "",
      type: allowedType,
      starColor: theme.starColor,
      radius: theme.radius,
      font: theme.font,
      motion: theme.motion,
      maxReviews: layout.maxReviews,
      showPhotos,
      showReplies: layout.showReplies,
      showBranding: resolveBranding(tier, widgetRow?.settings.showBranding ?? true),
    },
    aggregate,
    reviews: list,
    product: req.productExternalId
      ? { externalId: req.productExternalId, title: productTitle }
      : null,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * The cached entry point. Keyed on everything that changes the response and
 * tagged so moderation can purge it; `store.publicKey` is deliberately *not* part
 * of the key — rotating a key must not orphan a cache entry.
 */
export async function widgetPayload(req: PayloadRequest): Promise<WidgetPayload> {
  const key = [req.store.id, req.tier, req.widgetId ?? "-", req.productExternalId ?? "-"];
  const cached = unstable_cache(
    async () => buildPayload(req),
    ["widget-payload", ...key],
    { revalidate: DATA_CACHE_SECONDS, tags: [storeReviewsTag(req.store.id)] },
  );
  return cached();
}

/** Uncached, for the merchant's own studio previews — they must be instant-truthful. */
export async function widgetPayloadFresh(req: PayloadRequest): Promise<WidgetPayload> {
  return buildPayload(req);
}

/**
 * Reviews: submission, moderation, and the aggregate the widgets read.
 *
 * Two rules here are product law rather than implementation detail:
 *
 *  - **No gating.** `autoPublishDecision` decides whether a review skips the
 *    moderation queue. It never decides whether the request was *sent*, and
 *    there is no setting that suppresses low ratings from being asked for. The
 *    FTC's 2024 rule bans selectively soliciting positive reviews, and a
 *    competitor has already been burned for it (README risk 3).
 *  - **Incentives are rating-blind.** A photo earns the code at one star exactly
 *    as it does at five, and every incentivised review carries its disclosure
 *    line, stored on the row so it cannot drift later.
 */

import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  discountCodes,
  reviewMedia,
  reviewRequests,
  reviews,
  stores,
  type Review,
  type ReviewMediaRow,
  type ReviewStatus,
  type Store,
  type Tier,
} from "@/db/schema";
import { dedupeHash, newDiscountCode } from "@/lib/crypto";
import { NotFoundError, ValidationError } from "@/lib/errors";
import { featureAllowed } from "@/lib/plans";
import { storePhoto, type StoredPhoto } from "@/lib/media";

export interface Aggregate {
  rating: number;
  count: number;
  distribution: [number, number, number, number, number];
}

export const EMPTY_AGGREGATE: Aggregate = {
  rating: 0,
  count: 0,
  distribution: [0, 0, 0, 0, 0],
};

/**
 * Does this rating publish immediately, or wait for the merchant?
 *
 * Pure and separately tested: the threshold is the one setting that decides
 * whether a stranger's words appear on a storefront unread, so it must not be
 * possible to get it off by one.
 */
export function autoPublishDecision(rating: number, threshold: number): ReviewStatus {
  const value = Math.round(rating);
  const min = Math.min(5, Math.max(1, Math.round(threshold)));
  return value >= min ? "approved" : "pending";
}

/** The mean, floored to one decimal — 4.87 shows as 4.8, never as 4.9. */
export function meanRating(distribution: readonly number[]): number {
  let total = 0;
  let weighted = 0;
  for (let stars = 1; stars <= 5; stars++) {
    const n = distribution[stars - 1] ?? 0;
    total += n;
    weighted += n * stars;
  }
  if (!total) return 0;
  return Math.floor((weighted / total) * 10) / 10;
}

/* ------------------------------------------------------------- aggregates --- */

export async function aggregateFor(
  storeId: string,
  productExternalId?: string | null,
): Promise<Aggregate> {
  const db = getDb();
  const rows = await db
    .select({ rating: reviews.rating, n: sql<number>`count(*)::int` })
    .from(reviews)
    .where(
      and(
        eq(reviews.storeId, storeId),
        eq(reviews.status, "approved"),
        productExternalId ? eq(reviews.productExternalId, productExternalId) : undefined,
      ),
    )
    .groupBy(reviews.rating);

  const distribution: [number, number, number, number, number] = [0, 0, 0, 0, 0];
  let count = 0;
  for (const row of rows) {
    const stars = Math.min(5, Math.max(1, Number(row.rating)));
    distribution[stars - 1] += Number(row.n);
    count += Number(row.n);
  }
  return { rating: meanRating(distribution), count, distribution };
}

/* ------------------------------------------------------------- moderation --- */

export interface ReviewWithMedia {
  review: Review;
  media: ReviewMediaRow[];
}

export async function listReviews(
  storeId: string,
  opts: { status?: ReviewStatus; limit?: number } = {},
): Promise<ReviewWithMedia[]> {
  const db = getDb();
  const rows = await db
    .select()
    .from(reviews)
    .where(
      and(eq(reviews.storeId, storeId), opts.status ? eq(reviews.status, opts.status) : undefined),
    )
    .orderBy(desc(reviews.createdAt))
    .limit(Math.min(200, opts.limit ?? 50));

  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const media = await db.select().from(reviewMedia).where(inArray(reviewMedia.reviewId, ids));

  const byReview = new Map<string, ReviewMediaRow[]>();
  for (const m of media) {
    const list = byReview.get(m.reviewId) ?? [];
    list.push(m);
    byReview.set(m.reviewId, list);
  }
  return rows.map((review) => ({ review, media: byReview.get(review.id) ?? [] }));
}

export async function countByStatus(storeId: string): Promise<Record<ReviewStatus, number>> {
  const db = getDb();
  const rows = await db
    .select({ status: reviews.status, n: sql<number>`count(*)::int` })
    .from(reviews)
    .where(eq(reviews.storeId, storeId))
    .groupBy(reviews.status);

  const out: Record<ReviewStatus, number> = { pending: 0, approved: 0, rejected: 0 };
  for (const row of rows) out[row.status] = Number(row.n);
  return out;
}

async function ownedReview(id: string, storeId: string): Promise<Review> {
  const db = getDb();
  const [review] = await db
    .select()
    .from(reviews)
    .where(and(eq(reviews.id, id), eq(reviews.storeId, storeId)));
  if (!review) throw new NotFoundError("That review does not exist");
  return review;
}

export async function setReviewStatus(
  id: string,
  storeId: string,
  status: ReviewStatus,
): Promise<Review> {
  const review = await ownedReview(id, storeId);
  const db = getDb();
  const [updated] = await db
    .update(reviews)
    .set({
      status,
      publishedAt: status === "approved" ? (review.publishedAt ?? new Date()) : null,
    })
    .where(eq(reviews.id, review.id))
    .returning();

  // Photos ride with the review's decision: approving a review publishes its photo.
  await db
    .update(reviewMedia)
    .set({ moderationStatus: status === "approved" ? "approved" : "rejected" })
    .where(eq(reviewMedia.reviewId, review.id));

  return updated;
}

export async function bulkSetStatus(
  storeId: string,
  ids: string[],
  status: ReviewStatus,
): Promise<number> {
  let changed = 0;
  for (const id of ids) {
    try {
      await setReviewStatus(id, storeId, status);
      changed++;
    } catch {
      // A stale id from a form that raced with another tab: skip it silently.
    }
  }
  return changed;
}

export async function replyToReview(id: string, storeId: string, reply: string): Promise<void> {
  const review = await ownedReview(id, storeId);
  const text = reply.trim();
  if (!text) throw new ValidationError("Write something before you send the reply");
  if (text.length > 800) throw new ValidationError("Keep the reply under 800 characters");

  const db = getDb();
  await db
    .update(reviews)
    .set({ reply: text, repliedAt: new Date() })
    .where(eq(reviews.id, review.id));
}

/* ------------------------------------------------------------- submission --- */

export interface SubmissionInput {
  rating: number;
  title?: string | null;
  body: string;
  authorName: string;
  productExternalId?: string | null;
  productTitle?: string | null;
  photo?: { bytes: Buffer; contentType: string } | null;
}

export interface SubmissionResult {
  review: Review;
  photo: StoredPhoto | null;
  incentiveCode: string | null;
  disclosure: string | null;
  autoPublished: boolean;
}

export const FTC_DISCLOSURE =
  "This reviewer received a discount code for adding a photo. The code was offered for any photo review, whatever the rating.";

/**
 * Record a shopper's review against a request token's order.
 *
 * The tier is the merchant's, not the shopper's: a Starter store simply does not
 * offer the photo step, so a photo arriving there is dropped rather than stored
 * — never billed for, never half-supported.
 */
export async function submitReview(args: {
  store: Store;
  tier: Tier;
  requestId: string | null;
  orderId: string | null;
  authorEmail: string | null;
  input: SubmissionInput;
}): Promise<SubmissionResult> {
  const { store, tier, input } = args;

  const rating = Math.round(input.rating);
  if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
    throw new ValidationError("Pick a rating from one to five stars");
  }
  const body = (input.body ?? "").trim();
  if (body.length > 4_000) throw new ValidationError("Keep the review under 4,000 characters");
  const authorName = (input.authorName ?? "").trim().slice(0, 60) || "Verified buyer";
  const title = (input.title ?? "").trim().slice(0, 120) || null;

  const status = autoPublishDecision(rating, store.autoPublishMinRating);
  const db = getDb();

  const wantsPhoto = Boolean(input.photo && input.photo.bytes.byteLength);
  const photoAllowed = wantsPhoto && featureAllowed(tier, "photoReviews");

  const [review] = await db
    .insert(reviews)
    .values({
      storeId: store.id,
      orderId: args.orderId,
      requestId: args.requestId,
      productExternalId: input.productExternalId ?? null,
      productTitle: input.productTitle ?? null,
      rating,
      title,
      body,
      authorName,
      authorEmail: args.authorEmail,
      verifiedPurchase: Boolean(args.orderId),
      status,
      source: "native",
      publishedAt: status === "approved" ? new Date() : null,
      dedupeHash: dedupeHash([authorName, body, new Date().toISOString().slice(0, 10)]),
    })
    .returning();

  let photo: StoredPhoto | null = null;
  if (photoAllowed && input.photo) {
    photo = await storePhoto({
      reviewId: review.id,
      bytes: input.photo.bytes,
      contentType: input.photo.contentType,
      moderationStatus: status === "approved" ? "approved" : "pending",
    });
  }

  // The incentive is earned by the photo, at any rating. No gating, ever.
  let incentiveCode: string | null = null;
  let disclosure: string | null = null;
  if (photo && store.incentiveEnabled && featureAllowed(tier, "incentives")) {
    incentiveCode = await issueDiscountCode(store, review.id);
    disclosure = FTC_DISCLOSURE;
    await db
      .update(reviews)
      .set({ incentiveCode, incentiveDisclosure: disclosure })
      .where(eq(reviews.id, review.id));
    review.incentiveCode = incentiveCode;
    review.incentiveDisclosure = disclosure;
  }

  if (args.requestId) {
    await db
      .update(reviewRequests)
      .set({ status: "submitted", submittedAt: new Date() })
      .where(eq(reviewRequests.id, args.requestId));
  }

  return {
    review,
    photo,
    incentiveCode,
    disclosure,
    autoPublished: status === "approved",
  };
}

/** Issue a unique code, retrying on the vanishingly rare collision. */
export async function issueDiscountCode(store: Store, reviewId: string): Promise<string> {
  const db = getDb();
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = newDiscountCode(store.incentivePrefix);
    try {
      await db.insert(discountCodes).values({
        code,
        storeId: store.id,
        reviewId,
        percentOff: store.incentivePercent,
      });
      return code;
    } catch {
      // Primary-key clash: draw again.
    }
  }
  throw new Error("Could not issue a discount code");
}

/** Codes a merchant has issued, newest first — the incentive ledger. */
export async function listDiscountCodes(storeId: string, limit = 20) {
  const db = getDb();
  return db
    .select()
    .from(discountCodes)
    .where(eq(discountCodes.storeId, storeId))
    .orderBy(desc(discountCodes.issuedAt))
    .limit(limit);
}

/** Products seen in reviews, for the per-product widget snippet picker. */
export async function reviewedProducts(
  storeId: string,
): Promise<{ externalId: string; title: string | null; n: number }[]> {
  const db = getDb();
  const rows = await db
    .select({
      externalId: reviews.productExternalId,
      title: sql<string | null>`max(${reviews.productTitle})`,
      n: sql<number>`count(*)::int`,
    })
    .from(reviews)
    .where(and(eq(reviews.storeId, storeId), sql`${reviews.productExternalId} is not null`))
    .groupBy(reviews.productExternalId)
    .orderBy(desc(sql`count(*)`))
    .limit(25);
  return rows
    .filter((r): r is { externalId: string; title: string | null; n: number } =>
      Boolean(r.externalId),
    )
    .map((r) => ({ externalId: r.externalId, title: r.title, n: Number(r.n) }));
}

/** Reviews still waiting on the merchant, across every store they own. */
export async function pendingForMerchant(merchantId: string): Promise<number> {
  const db = getDb();
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(reviews)
    .innerJoin(stores, eq(stores.id, reviews.storeId))
    .where(and(eq(stores.merchantId, merchantId), eq(reviews.status, "pending")));
  return Number(row?.n ?? 0);
}

/** Reviews with no photo yet — used by the dashboard's incentive nudge. */
export async function countWithoutMedia(storeId: string): Promise<number> {
  const db = getDb();
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(reviews)
    .leftJoin(reviewMedia, eq(reviewMedia.reviewId, reviews.id))
    .where(and(eq(reviews.storeId, storeId), isNull(reviewMedia.id)));
  return Number(row?.n ?? 0);
}

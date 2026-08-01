/**
 * The wire format between the cached reviews API and the embed.
 *
 * Kept deliberately flat and string-typed: it is JSON on a CDN, it is public,
 * and it must stay small. Nothing here is a Date — the server formats once so
 * every storefront doesn't pay for `toLocaleDateString` in the widget bundle.
 */

export type WidgetType = "wall" | "carousel" | "badge" | "stars";

export interface WidgetPhoto {
  url: string;
  width: number;
  height: number;
}

export interface WidgetReview {
  id: string;
  rating: number;
  title: string | null;
  body: string;
  author: string;
  /** True renders the leaf-check. DESIGN.md: no exceptions, ever. */
  verified: boolean;
  /** Pre-formatted, e.g. "Jun 24". */
  date: string;
  /** ISO-8601 date, for the JSON-LD `datePublished`. */
  dateIso: string;
  product: string | null;
  reply: string | null;
  photos: WidgetPhoto[];
  /** FTC disclosure line, present only on incentivised reviews. */
  disclosure: string | null;
}

export interface WidgetAggregate {
  /** Mean rating to one decimal, e.g. 4.8. 0 when there are no reviews. */
  rating: number;
  count: number;
  /** Counts for 1..5 stars, index 0 = one star. */
  distribution: [number, number, number, number, number];
}

export interface WidgetConfig {
  id: string;
  type: WidgetType;
  starColor: string;
  radius: number;
  /** "merchant" inherits the storefront's font; "trustbadge" uses our stack. */
  font: "merchant" | "trustbadge";
  motion: boolean;
  maxReviews: number;
  showPhotos: boolean;
  showReplies: boolean;
  showBranding: boolean;
}

export interface WidgetPayload {
  store: { name: string; url: string | null };
  widget: WidgetConfig;
  aggregate: WidgetAggregate;
  reviews: WidgetReview[];
  /** Product this payload was filtered to, if any. */
  product: { externalId: string; title: string | null } | null;
  generatedAt: string;
}

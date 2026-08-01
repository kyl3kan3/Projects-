/**
 * Widget instances: the merchant's copies of the four embeds, their theme
 * tokens, and the snippet they paste into a storefront.
 *
 * The snippet is the product's contract with the host page, so it is generated
 * here in one place rather than assembled in a component: it carries the
 * reserved height that makes CLS 0.00 true, and getting that number from
 * anywhere but the live review count would quietly break the guarantee.
 */

import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  widgetImpressions,
  widgetSettings,
  widgets,
  type Store,
  type Tier,
  type Widget,
  type WidgetLayout,
  type WidgetSettingsRow,
  type WidgetTheme,
  type WidgetType,
} from "@/db/schema";
import { env } from "@/lib/env";
import { NotFoundError, PlanLimitError, ValidationError } from "@/lib/errors";
import { plan, resolveBranding, tierUnlockingWidget, widgetTypeAllowed } from "@/lib/plans";
import { reservedHeight } from "@/widget/render";

export const WIDGET_TYPES: WidgetType[] = ["wall", "carousel", "badge", "stars"];

export const WIDGET_META: Record<
  WidgetType,
  { label: string; blurb: string; defaultMax: number; suggestedName: string }
> = {
  wall: {
    label: "Reviews wall",
    blurb: "A masonry grid that grows 1 to 4 columns to fit the slot it is dropped into.",
    defaultMax: 12,
    suggestedName: "Homepage wall",
  },
  carousel: {
    label: "Carousel",
    blurb: "One row, swipe or arrows. Fits under a product description without pushing it down.",
    defaultMax: 10,
    suggestedName: "Product page carousel",
  },
  badge: {
    label: "Badge",
    blurb: "Score, stars, and the verified count. The smallest honest summary.",
    defaultMax: 0,
    suggestedName: "Footer badge",
  },
  stars: {
    label: "Star snippet",
    blurb: "An inline star row for collection tiles and product headers.",
    defaultMax: 0,
    suggestedName: "Collection stars",
  },
};

export function defaultTheme(): WidgetTheme {
  return { starColor: "#e09112", radius: 12, font: "merchant", motion: true };
}

export function defaultLayout(type: WidgetType): WidgetLayout {
  return {
    maxReviews: WIDGET_META[type].defaultMax || 8,
    showPhotos: type === "wall" || type === "carousel",
    showReplies: type === "wall" || type === "carousel",
  };
}

export interface WidgetWithSettings {
  widget: Widget;
  settings: WidgetSettingsRow;
}

export async function listWidgets(storeId: string): Promise<WidgetWithSettings[]> {
  const db = getDb();
  const rows = await db
    .select({ widget: widgets, settings: widgetSettings })
    .from(widgets)
    .innerJoin(widgetSettings, eq(widgetSettings.widgetId, widgets.id))
    .where(eq(widgets.storeId, storeId))
    .orderBy(desc(widgets.createdAt));
  return rows;
}

export async function getWidget(id: string, storeId: string): Promise<WidgetWithSettings> {
  const db = getDb();
  const [row] = await db
    .select({ widget: widgets, settings: widgetSettings })
    .from(widgets)
    .innerJoin(widgetSettings, eq(widgetSettings.widgetId, widgets.id))
    .where(and(eq(widgets.id, id), eq(widgets.storeId, storeId)));
  if (!row) throw new NotFoundError("That widget does not exist");
  return row;
}

export async function createWidget(args: {
  storeId: string;
  tier: Tier;
  type: WidgetType;
  name?: string;
}): Promise<Widget> {
  if (!WIDGET_TYPES.includes(args.type)) throw new ValidationError("Unknown widget type");

  if (!widgetTypeAllowed(args.tier, args.type)) {
    const needed = tierUnlockingWidget(args.type);
    throw new PlanLimitError(
      `The ${WIDGET_META[args.type].label.toLowerCase()} needs ${needed ? plan(needed as Tier).name : "a paid"} — Free includes the badge.`,
      needed,
    );
  }

  const name = (args.name ?? "").trim() || WIDGET_META[args.type].suggestedName;
  if (name.length > 60) throw new ValidationError("Keep the widget name under 60 characters");

  const db = getDb();
  const [widget] = await db
    .insert(widgets)
    .values({ storeId: args.storeId, type: args.type, name })
    .returning();
  await db.insert(widgetSettings).values({
    widgetId: widget.id,
    theme: defaultTheme(),
    layout: defaultLayout(args.type),
    showBranding: true,
  });
  return widget;
}

export async function updateWidgetSettings(
  id: string,
  storeId: string,
  patch: { theme?: Partial<WidgetTheme>; layout?: Partial<WidgetLayout>; showBranding?: boolean },
): Promise<void> {
  const { settings } = await getWidget(id, storeId);
  const theme: WidgetTheme = { ...settings.theme, ...patch.theme };
  const layout: WidgetLayout = { ...settings.layout, ...patch.layout };
  // A widget asking for 400 reviews is a payload problem, not a preference.
  layout.maxReviews = Math.min(48, Math.max(1, Math.round(layout.maxReviews) || 8));

  const db = getDb();
  await db
    .update(widgetSettings)
    .set({
      theme,
      layout,
      showBranding: patch.showBranding ?? settings.showBranding,
      updatedAt: new Date(),
    })
    .where(eq(widgetSettings.widgetId, id));
}

export async function deleteWidget(id: string, storeId: string): Promise<void> {
  const db = getDb();
  await db.delete(widgets).where(and(eq(widgets.id, id), eq(widgets.storeId, storeId)));
}

/** Pause nothing, delete nothing: a downgrade only stops the disallowed types rendering. */
export async function widgetTypesBlockedByPlan(
  storeId: string,
  tier: Tier,
): Promise<WidgetType[]> {
  const rows = await listWidgets(storeId);
  const blocked = new Set<WidgetType>();
  for (const row of rows) {
    if (!widgetTypeAllowed(tier, row.widget.type)) blocked.add(row.widget.type);
  }
  return [...blocked];
}

/* -------------------------------------------------------------- impressions --- */

/** UTC midnight for a timestamp — the rollup's bucket key. */
export function utcDay(at: Date = new Date()): Date {
  return new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate()));
}

export async function recordImpression(widgetId: string, at: Date = new Date()): Promise<void> {
  const db = getDb();
  await db
    .insert(widgetImpressions)
    .values({ widgetId, day: utcDay(at), impressions: 1 })
    .onConflictDoUpdate({
      target: [widgetImpressions.widgetId, widgetImpressions.day],
      set: { impressions: sql`${widgetImpressions.impressions} + 1` },
    });
}

/** Impressions across a store's widgets over the last `days` days. */
export async function impressionsFor(
  storeId: string,
  days = 30,
): Promise<{ total: number; byWidget: Map<string, number> }> {
  const rows = await listWidgets(storeId);
  const ids = rows.map((r) => r.widget.id);
  if (!ids.length) return { total: 0, byWidget: new Map() };

  const since = utcDay(new Date(Date.now() - days * 86_400_000));
  const db = getDb();
  const counts = await db
    .select({
      widgetId: widgetImpressions.widgetId,
      total: sql<number>`coalesce(sum(${widgetImpressions.impressions}), 0)::int`,
    })
    .from(widgetImpressions)
    // `gte(column, date)` rather than a raw sql fragment: inside sql`...` the Date
    // is handed to the driver unencoded, and postgres.js then tries to take the
    // byte length of a Date object. The typed helper applies the column's encoder.
    .where(and(inArray(widgetImpressions.widgetId, ids), gte(widgetImpressions.day, since)))
    .groupBy(widgetImpressions.widgetId);

  const byWidget = new Map(counts.map((c) => [c.widgetId, Number(c.total)]));
  let total = 0;
  for (const value of byWidget.values()) total += value;
  return { total, byWidget };
}

/* ----------------------------------------------------------------- snippet --- */

export interface SnippetArgs {
  store: Pick<Store, "publicKey">;
  widget: Widget;
  settings: WidgetSettingsRow;
  /** Live review count, so the reserved height matches what will render. */
  reviewCount: number;
  /** Set when the snippet is for a single product page. */
  productExternalId?: string | null;
}

/**
 * The snippet a merchant copies. One async script tag and one container whose
 * height is already reserved.
 *
 * `data-reserve` is the zero-CLS mechanism: the script applies it before the
 * fetch, so the reviews land into space that was always theirs.
 */
export function embedSnippet(args: SnippetArgs): string {
  const { widget, settings } = args;
  const height = reservedHeight(widget.type, Math.min(args.reviewCount, settings.layout.maxReviews), {
    containerWidth: 390,
    withPhotos: settings.layout.showPhotos,
  });

  const cdn = env.widgetCdnUrl;
  const appHost = safeHost(env.appUrl);
  const cdnHost = safeHost(cdn);
  // The embed derives the API base from its own src; only spell it out when the
  // script is served from a different host than the API.
  const apiAttr = appHost && cdnHost && appHost !== cdnHost ? `\n  data-api="${env.appUrl}"` : "";
  const productAttr = args.productExternalId
    ? `\n  data-product="${escapeAttribute(args.productExternalId)}"`
    : "";

  const container =
    widget.type === "stars"
      ? `<span id="trustbadge-${widget.id}" style="display:inline-block;min-height:${height}px"></span>`
      : `<div id="trustbadge-${widget.id}" style="min-height:${height}px"></div>`;

  return [
    `<!-- TrustBadge ${WIDGET_META[widget.type].label} -->`,
    container,
    `<script async src="${cdn}/w.js"`,
    `  data-store="${args.store.publicKey}"`,
    `  data-widget="${widget.id}"`,
    `  data-type="${widget.type}"`,
    `  data-reserve="${height}"${productAttr}${apiAttr}></script>`,
  ].join("\n");
}

function safeHost(url: string): string | null {
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
}

function escapeAttribute(value: string): string {
  return value.replace(/[&<>"']/g, (c) =>
    c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : c === '"' ? "&quot;" : "&#39;",
  );
}

/** Whether this widget's branding link renders, after the plan has its say. */
export function brandingFor(tier: Tier, settings: WidgetSettingsRow): boolean {
  return resolveBranding(tier, settings.showBranding);
}

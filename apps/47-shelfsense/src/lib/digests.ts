/**
 * Email digests: the weekly reorder summary and the monthly dead-stock report.
 *
 * The failure mode these are written against is the one that kills email products:
 * a state that stays true forever ("this SKU is still overdue") mailed on a naive
 * daily sweep until the merchant files the sender under spam. Two defences:
 *
 *  - **A digest is pinned to a period, not to a condition.** Week 2026-W31 can be
 *    sent once. The unique index on `(shop, kind, period_key)` is the guarantee, not
 *    a flag in the code.
 *  - **The weekly only goes out on the shop's chosen weekday**, and the monthly only
 *    in the first days of a month. A sweep that runs every ten minutes therefore
 *    sends at most one of each per period, whatever it is called.
 *
 * The models come from lib/views, which is the same source the screens read, so a
 * digest can never quote a number the dashboard disagrees with.
 */

import { eq, isNull } from "drizzle-orm";
import { getDb } from "@/db";
import { digestSends, merchants, shops, type DigestKind, type Shop } from "@/db/schema";
import { shortDate, todayInZone } from "@/lib/dates";
import { digestDueOn, periodKeyFor } from "@/lib/digest-periods";
import { emailButton, emailRow, emailShell, emailTable, escapeHtml, sendEmail } from "@/lib/email";
import { env } from "@/lib/env";
import { count, cover, money, moneyExact, perDay } from "@/lib/format";
import { resolveSettings } from "@/lib/settings";
import { suggestedAction } from "@/lib/deadstock";
import { deadStockBoard, reorderBoard } from "@/lib/views";

export interface DigestOutcome {
  kind: DigestKind;
  shopId: string;
  periodKey: string;
  sent: boolean;
  suppressed: boolean;
  skippedReason: string | null;
  recipient: string | null;
  subject: string | null;
}

/** Is this digest due for this shop today? Reads the shop's own settings. */
export function digestDueToday(kind: DigestKind, shop: Shop, localDate: string): boolean {
  return digestDueOn(kind, resolveSettings(shop.settings), localDate);
}

export { periodKeyFor };

async function recipientFor(shop: Shop): Promise<string | null> {
  if (shop.email) return shop.email;
  const db = getDb();
  const [merchant] = await db
    .select({ email: merchants.email })
    .from(merchants)
    .where(eq(merchants.id, shop.merchantId))
    .limit(1);
  return merchant?.email ?? null;
}

/**
 * Send one digest, or explain why not.
 *
 * The `digest_sends` row is written *before* the transport is called and marked
 * suppressed when nothing left the building. That ordering is deliberate: a send
 * that half-fails must not be retried into a second copy, and the merchant's
 * evidence of what we did is a row, not a log line.
 */
export async function sendDigest(
  shop: Shop,
  kind: DigestKind,
  options: { localDate?: string; force?: boolean } = {},
): Promise<DigestOutcome> {
  const db = getDb();
  const localDate = options.localDate ?? todayInZone(shop.timezone);
  const periodKey = periodKeyFor(kind, localDate);
  const base: DigestOutcome = {
    kind,
    shopId: shop.id,
    periodKey,
    sent: false,
    suppressed: false,
    skippedReason: null,
    recipient: null,
    subject: null,
  };

  if (shop.uninstalledAt) {
    return { ...base, skippedReason: "shop uninstalled" };
  }
  if (!options.force && !digestDueToday(kind, shop, localDate)) {
    return { ...base, skippedReason: "not due today" };
  }

  const recipient = await recipientFor(shop);
  if (!recipient) return { ...base, skippedReason: "no recipient on file" };

  const model =
    kind === "weekly_reorder"
      ? await weeklyDigestModel(shop, localDate)
      : await monthlyDeadStockModel(shop, localDate);
  if (!model) return { ...base, skippedReason: "no forecast run yet", recipient };
  if (model.skip) return { ...base, skippedReason: model.skip, recipient };

  // Claim the period first. A conflict means this period is already accounted for
  // — by another tick, another region, or a retry — and the digest is not resent.
  const claimed = await db
    .insert(digestSends)
    .values({
      shopId: shop.id,
      kind,
      periodKey,
      recipient,
      subject: model.subject,
      suppressed: false,
    })
    .onConflictDoNothing({ target: [digestSends.shopId, digestSends.kind, digestSends.periodKey] })
    .returning({ id: digestSends.id });
  if (!claimed.length) {
    return { ...base, skippedReason: "already sent for this period", recipient };
  }

  const result = await sendEmail({
    to: recipient,
    subject: model.subject,
    html: model.html,
    text: model.text,
  });

  if (!result.ok) {
    // Release the claim so the next sweep can try again — a transport failure is
    // not a delivered digest.
    await db.delete(digestSends).where(eq(digestSends.id, claimed[0].id));
    return { ...base, skippedReason: result.error ?? "send failed", recipient, subject: model.subject };
  }

  if (result.suppressed) {
    await db
      .update(digestSends)
      .set({ suppressed: true })
      .where(eq(digestSends.id, claimed[0].id));
  }

  return {
    ...base,
    sent: true,
    suppressed: result.suppressed,
    recipient,
    subject: model.subject,
  };
}

interface DigestModel {
  subject: string;
  html: string;
  text: string;
  skip?: string;
}

/* --------------------------------------------------------------- weekly --- */

export async function weeklyDigestModel(
  shop: Shop,
  localDate: string,
): Promise<DigestModel | null> {
  const board = await reorderBoard(shop.id);
  if (!board.runDate) return null;

  const orderNow = board.rows.filter((r) => r.status === "order_now");
  const orderSoon = board.rows.filter((r) => r.status === "order_soon");
  if (!orderNow.length && !orderSoon.length && board.totals.revenueAtRiskCents === 0) {
    // Nothing to act on. An empty weekly digest teaches the merchant to ignore
    // the sender, which costs the one that matters.
    return {
      subject: "",
      html: "",
      text: "",
      skip: "nothing at risk this week",
    };
  }

  const top = [...orderNow, ...orderSoon].slice(0, 8);
  const rows = top
    .map((row) =>
      emailRow(
        row.displayTitle,
        `${row.reorderQty} units · by ${row.orderByDate ? shortDate(row.orderByDate) : "—"}`,
        row.status === "order_now" ? "risk" : "plain",
      ),
    )
    .join("");

  const subject = orderNow.length
    ? `${orderNow.length} SKU${orderNow.length === 1 ? "" : "s"} to order now · ${money(board.totals.revenueAtRiskCents)} at risk`
    : `${orderSoon.length} SKU${orderSoon.length === 1 ? "" : "s"} to order this week`;

  const html = emailShell({
    preheader: `${money(board.totals.revenueAtRiskCents)} of sales at risk in the next 30 days.`,
    heading: `${money(board.totals.revenueAtRiskCents)} at risk in the next 30 days`,
    body: `<p style="margin:0 0 8px;">Week of ${shortDate(localDate)} for ${escapeHtml(shop.name)}. ${board.totals.pastOrderBy} SKU${board.totals.pastOrderBy === 1 ? " is" : "s are"} past their order-by date, ${board.totals.dueThisWeek} due within seven days.</p>
${emailTable(rows)}
${emailButton(`${env.appUrl}/reorder`, "Open the reorder list")}`,
  });

  const text = [
    `${money(board.totals.revenueAtRiskCents)} at risk in the next 30 days`,
    `${board.totals.pastOrderBy} past order-by, ${board.totals.dueThisWeek} due this week.`,
    "",
    ...top.map(
      (row) =>
        `${row.sku}  ${row.reorderQty} units by ${row.orderByDate ?? "—"}  (${perDay(row.blendedVelocity)}, ${cover(row.daysOfCover)} cover)`,
    ),
    "",
    `${env.appUrl}/reorder`,
  ].join("\n");

  return { subject, html, text };
}

/* -------------------------------------------------------------- monthly --- */

export async function monthlyDeadStockModel(
  shop: Shop,
  localDate: string,
): Promise<DigestModel | null> {
  const board = await deadStockBoard(shop.id);
  if (!board.runDate) return null;
  if (!board.rows.length) {
    return { subject: "", html: "", text: "", skip: "no dead stock this month" };
  }

  const top = board.rows.slice(0, 10);
  const rows = top
    .map((row) =>
      emailRow(
        row.displayTitle,
        `${count(row.units)} units · ${cover(row.daysOfCover)} · ${moneyExact(row.cashTiedUpCents)}`,
      ),
    )
    .join("");

  const subject = `${money(board.totalCents)} sitting on the shelf`;
  const html = emailShell({
    preheader: `${board.rows.length} SKUs are holding ${money(board.totalCents)} of cash.`,
    heading: `${money(board.totalCents)} sitting on the shelf`,
    body: `<p style="margin:0 0 8px;">${monthName(localDate)} dead-stock report for ${escapeHtml(shop.name)}. ${board.rows.length} SKU${board.rows.length === 1 ? "" : "s"} with more cover than they can sell through${board.snoozedCount ? `, plus ${board.snoozedCount} you have snoozed` : ""}.</p>
${emailTable(rows)}
<p style="margin:16px 0 0;font-size:14px;color:#a79d89;">Biggest single drag: ${escapeHtml(top[0].displayTitle)} — ${escapeHtml(suggestedAction(top[0]))}</p>
${emailButton(`${env.appUrl}/dead-stock`, "Open the dead-stock report")}`,
  });

  const text = [
    `${money(board.totalCents)} sitting on the shelf`,
    "",
    ...top.map(
      (row) =>
        `${row.sku}  ${count(row.units)} units  ${cover(row.daysOfCover)} cover  ${moneyExact(row.cashTiedUpCents)}${row.costMissing ? " (cost estimated)" : ""}`,
    ),
    "",
    `${env.appUrl}/dead-stock`,
  ].join("\n");

  return { subject, html, text };
}

function monthName(localDate: string): string {
  const names = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];
  return names[Number(localDate.slice(5, 7)) - 1] ?? localDate.slice(0, 7);
}

/* ------------------------------------------------------------ alert mail --- */

/**
 * The "these crossed into order-now" email, sent from the nightly run.
 *
 * One email per run listing every SKU that *crossed*, not one per SKU and not one
 * per SKU per day. The crossing is what is new; the state persisting is not news,
 * and the alerts ledger is what knows the difference.
 */
export async function sendOrderNowAlert(
  shop: Shop,
  crossings: { sku: string; title: string }[],
): Promise<{ sent: boolean; suppressed: boolean; recipient: string | null }> {
  if (!crossings.length) return { sent: false, suppressed: false, recipient: null };
  const recipient = await recipientFor(shop);
  if (!recipient) return { sent: false, suppressed: false, recipient: null };

  const rows = crossings.map((c) => emailRow(c.title, c.sku, "risk")).join("");
  const subject =
    crossings.length === 1
      ? `${crossings[0].title} needs ordering now`
      : `${crossings.length} SKUs crossed into order-now`;

  const result = await sendEmail({
    to: recipient,
    subject,
    html: emailShell({
      preheader: `${crossings.length} SKU${crossings.length === 1 ? "" : "s"} reached the reorder point.`,
      heading: subject,
      body: `<p style="margin:0 0 8px;">These reached their reorder point on last night's run for ${escapeHtml(shop.name)}.</p>${emailTable(rows)}${emailButton(`${env.appUrl}/reorder`, "Draft the POs")}`,
    }),
    text: [subject, "", ...crossings.map((c) => `${c.sku}  ${c.title}`), "", `${env.appUrl}/reorder`].join("\n"),
  });

  return { sent: result.ok, suppressed: result.suppressed, recipient };
}

/** Shops that might have a digest due. Uninstalled shops are never included. */
export async function activeShops(limit = 200): Promise<Shop[]> {
  const db = getDb();
  return db.select().from(shops).where(isNull(shops.uninstalledAt)).limit(limit);
}

/**
 * /returns/[id] — check one order back in, line by line.
 *
 * Every line gets a 56px row with clean / damaged / missing steppers and a camera
 * button. The last line to be checked completes the return: clean releases the
 * hold automatically, anything else drafts claims from the fee schedule and leaves
 * the deposit for a person to settle.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { recordCheckAction } from "../actions";
import { CheckInRow } from "@/components/CheckInRow";
import { OrderPlacard } from "@/components/Placard";
import { requireSession } from "@/lib/auth";
import { checksFor } from "@/lib/checkin";
import { returnOutcome } from "@/lib/checkin-core";
import { photosFor } from "@/lib/claims";
import { formatDateWithDow, formatWindow } from "@/lib/dates";
import { holdSentence } from "@/lib/holds";
import { formatMoney } from "@/lib/money";
import { getOrder, todayFor } from "@/lib/orders";
import { lateFeeCents } from "@/lib/pricing";
import { canWrite, entitlements } from "@/lib/plans";

export const metadata: Metadata = { title: "Check in" };

export default async function CheckInPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { account } = await requireSession();
  const full = await getOrder(account.id, id);
  if (!full) notFound();

  const { order, customer, lines } = full;
  const today = todayFor(account);
  const ent = entitlements(account);
  const gate = canWrite(ent);

  const inChecks = await checksFor(order.id, "in");
  const byLine = new Map(inChecks.map((c) => [c.orderLineId, c]));
  const photoCounts = new Map<string, number>();
  for (const check of inChecks) {
    photoCounts.set(check.orderLineId, (await photosFor(check.id)).length);
  }

  const outcome = returnOutcome(
    lines.map((l) => ({ orderLineId: l.id, quantity: l.quantity })),
    inChecks.map((c) => ({
      orderLineId: c.orderLineId,
      quantityOk: c.quantityOk,
      quantityDamaged: c.quantityDamaged,
      quantityMissing: c.quantityMissing,
    })),
  );

  const late = lateFeeCents(
    lines.map((l) => ({ quantity: l.quantity, dailyRateCents: l.dailyRateCents })),
    order.dueBackOn,
    today,
  );

  return (
    <main style={{ paddingBottom: 40 }}>
      <Link href="/returns" className="btn-quiet">
        Returns
      </Link>

      <div className="between" style={{ marginTop: 12 }}>
        <div style={{ minWidth: 0 }}>
          <h1 className="t-h2">Check in #{order.number}</h1>
          <p className="t-secondary" style={{ marginTop: 4 }}>
            {customer.name}
            {customer.company ? ` — ${customer.company}` : ""}
          </p>
        </div>
        <OrderPlacard order={order} today={today} />
      </div>

      <p className="t-mono tone-dim" style={{ marginTop: 8 }}>
        {formatWindow(order.outOn, order.dueBackOn)}
      </p>

      {late > 0 ? (
        <div className="banner" data-tone="warn" style={{ marginTop: 16 }} role="status">
          Due back {formatDateWithDow(order.dueBackOn)}. Late charges at the daily rate stand at{" "}
          {formatMoney(late)} — add them as a claim if the shop is charging them.
        </div>
      ) : null}

      <div className="panel" style={{ marginTop: 16, padding: 16 }}>
        <p className="t-label">Deposit</p>
        <p className="t-secondary" style={{ marginTop: 4 }}>
          {holdSentence(order, today)}
        </p>
        <p className="t-mono" style={{ marginTop: 4 }}>
          {formatMoney(order.depositCents)} held
        </p>
      </div>

      <p className="t-secondary" style={{ marginTop: 20 }}>
        {outcome.linesChecked} of {outcome.linesTotal} lines checked.
        {outcome.complete
          ? outcome.clean
            ? " Everything came back clean."
            : ` ${outcome.damagedTotal} damaged, ${outcome.missingTotal} missing.`
          : " Every unit has to be accounted for before the return completes."}
      </p>

      <section style={{ marginTop: 16 }}>
        <div className="stack">
          {lines.map((line) => {
            const existing = byLine.get(line.id);
            return (
              <CheckInRow
                key={line.id}
                orderId={order.id}
                orderLineId={line.id}
                itemName={line.itemName}
                quantity={line.quantity}
                direction="in"
                action={recordCheckAction}
                existing={
                  existing
                    ? {
                        quantityOk: existing.quantityOk,
                        quantityDamaged: existing.quantityDamaged,
                        quantityMissing: existing.quantityMissing,
                      }
                    : null
                }
                checkId={existing?.id ?? null}
                photoCount={photoCounts.get(line.id) ?? 0}
                disabled={!gate.allowed}
              />
            );
          })}
        </div>
      </section>

      {outcome.complete ? (
        <div style={{ marginTop: 24 }}>
          <Link href={`/orders/${order.id}`} className="btn btn-primary btn-full">
            {outcome.clean ? "See the closed order" : "Review the claims and settle the deposit"}
          </Link>
        </div>
      ) : null}
    </main>
  );
}

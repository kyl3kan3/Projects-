/**
 * /q/[token] — the customer's quote (DESIGN.md screen 4).
 *
 * A kraft-paper manifest: line items with quantities, the window, the terms, the
 * damage fee schedule, the deposit, then the signature and initials. No account,
 * ever — the signed link is the whole credential, and the order is resolved by
 * the sha256 of that link, never by an id in the URL.
 */

import type { Metadata } from "next";
import { eq } from "drizzle-orm";
import { SignPad } from "./SignPad";
import { acceptQuoteAction } from "./actions";
import { Placard } from "@/components/Placard";
import { IconHold } from "@/components/icons";
import { getDb } from "@/db";
import { accounts, items, orders } from "@/db/schema";
import { formatDateLong, formatWindow, isoDateOf } from "@/lib/dates";
import { depositsAreSimulated } from "@/lib/deposit-gateway";
import { confirmHoldFromRedirect } from "@/lib/deposits";
import { hashToken, verifyQuoteToken } from "@/lib/links";
import { formatMoney } from "@/lib/money";
import { getLines } from "@/lib/orders";
import { parseDamageFees, parseSettings } from "@/lib/settings";

export const metadata: Metadata = { title: "Your rental quote" };
export const dynamic = "force-dynamic";

export default async function QuotePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ deposit?: string; session?: string }>;
}) {
  const { token } = await params;
  const { deposit, session } = await searchParams;

  const verified = await verifyQuoteToken(token);
  if (!verified) return <Expired />;

  const db = getDb();
  const [order] = await db.select().from(orders).where(eq(orders.signTokenHash, hashToken(token)));
  if (!order || order.id !== verified.orderId) return <Expired />;

  /**
   * The return leg from hosted Checkout.
   *
   * Stripe substitutes the session id into the success URL, and this confirms the
   * authorisation actually landed rather than trusting the redirect. It is
   * idempotent and it runs alongside the webhook, not instead of it: a hosted
   * redirect whose only completion path is a webhook eventually drops a customer
   * back onto a signed contract with no hold behind it, which is the exact bug
   * this belt-and-braces exists to prevent.
   */
  let redirectNote: string | null = null;
  if (deposit === "done" && session) {
    const confirmation = await confirmHoldFromRedirect(order.id, session);
    redirectNote = confirmation.held
      ? "Your deposit hold is in place and the order is confirmed."
      : "We have not seen the authorisation land yet. Refresh in a moment, or the yard will be in touch.";
  } else if (deposit === "cancelled") {
    redirectNote =
      "The card step was cancelled. Your signature is on file, but the order is not confirmed until the deposit is authorised.";
  }

  const [fresh] = await db.select().from(orders).where(eq(orders.id, order.id));
  const [account] = await db.select().from(accounts).where(eq(accounts.id, order.accountId));
  const lines = await getLines(order.id);
  const settings = parseSettings(account?.settings);
  const today = isoDateOf(new Date());

  const feeSchedule = await Promise.all(
    lines.map(async (line) => {
      const [item] = await db.select().from(items).where(eq(items.id, line.itemId));
      return {
        itemName: line.itemName,
        fees: parseDamageFees(item?.damageFees),
        replacementCents: item?.replacementCents ?? null,
      };
    }),
  );

  const signed = Boolean(fresh.signedAt);
  const yardName = account?.name ?? "the yard";

  return (
    <main style={{ maxWidth: 640, margin: "0 auto", padding: "32px 20px 56px" }}>
      <header>
        <p className="t-placard tone-dim">{yardName}</p>
        <h1 className="t-h2" style={{ marginTop: 8 }}>
          {signed ? `Order #${fresh.number}` : `Rental quote #${fresh.number}`}
        </h1>
        <p className="t-mono tone-dim" style={{ marginTop: 8 }}>
          {formatWindow(fresh.outOn, fresh.dueBackOn)}
        </p>
      </header>

      {redirectNote ? (
        <div
          className="banner"
          data-tone={deposit === "cancelled" ? "warn" : "accent"}
          style={{ marginTop: 20 }}
          role="status"
        >
          {redirectNote}
        </div>
      ) : null}

      <section className="doc" style={{ marginTop: 20 }}>
        <p className="t-label">Gear</p>
        <div className="stack" style={{ marginTop: 8 }}>
          {lines.map((line) => (
            <div key={line.id} className="row">
              <div style={{ flex: 1, minWidth: 0 }}>
                <p className="t-title">{line.itemName}</p>
                <p className="t-mono tone-dim" style={{ marginTop: 2 }}>
                  {line.quantity} × {formatMoney(line.rateCents)} for these dates
                </p>
              </div>
              <span className="t-mono">{formatMoney(line.lineTotalCents)}</span>
            </div>
          ))}
        </div>

        <div className="doc-rule" />

        <Row label="Subtotal" value={formatMoney(fresh.subtotalCents)} />
        <Row label="Tax" value={formatMoney(fresh.taxCents)} />
        <Row label="Total" value={formatMoney(fresh.totalCents)} strong />

        <div className="doc-rule" />

        <div className="between">
          <span className="t-label">Security deposit</span>
          <span className="t-mono-lg">{formatMoney(fresh.depositCents)}</span>
        </div>
        <p className="t-secondary" style={{ marginTop: 8 }}>
          <IconHold size={16} /> An authorisation hold on your card — not a charge. Money moves only
          against a documented claim, and a clean return releases the whole hold the same day.
        </p>

        <div className="doc-rule" />

        <p className="t-label">Where it goes</p>
        <p className="t-body" style={{ marginTop: 8, whiteSpace: "pre-wrap" }}>
          {fresh.delivery
            ? (fresh.address ?? "Delivery — address to be confirmed")
            : `Customer pickup from ${yardName}`}
        </p>

        <div className="doc-rule" />

        <p className="t-label">Damage fee schedule</p>
        <div className="stack" style={{ marginTop: 8 }}>
          {feeSchedule.map((entry) => (
            <div key={entry.itemName} style={{ paddingBottom: 12 }}>
              <p className="t-title">{entry.itemName}</p>
              {entry.fees.length === 0 && !entry.replacementCents ? (
                <p className="t-secondary" style={{ marginTop: 2 }}>
                  No fees listed for this item.
                </p>
              ) : (
                <div className="stack" style={{ marginTop: 4 }}>
                  {entry.fees.map((fee) => (
                    <div key={fee.label} className="between">
                      <span className="t-secondary">{fee.label}</span>
                      <span className="t-mono">{formatMoney(fee.amountCents)}</span>
                    </div>
                  ))}
                  {entry.replacementCents ? (
                    <div className="between">
                      <span className="t-secondary">Replacement (missing)</span>
                      <span className="t-mono">{formatMoney(entry.replacementCents)}</span>
                    </div>
                  ) : null}
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="doc-rule" />

        <p className="t-label">Terms</p>
        <p className="t-secondary" style={{ marginTop: 8, whiteSpace: "pre-wrap" }}>
          {settings.terms}
        </p>
      </section>

      {signed ? (
        <section className="doc" style={{ marginTop: 20 }}>
          <div className="between">
            <p className="t-label">Signed</p>
            <Placard
              label={fresh.depositStatus === "held" ? "Deposit held" : "Deposit pending"}
              tone={fresh.depositStatus === "held" ? "accent" : "warn"}
            />
          </div>
          <p className="t-body" style={{ marginTop: 8 }}>
            {fresh.signerName} on {formatDateLong(fresh.signedAt!.toISOString().slice(0, 10))},
            initialled {fresh.signerInitials} on the damage terms.
          </p>
          {fresh.docHash ? (
            <p className="t-mono tone-dim" style={{ marginTop: 8, wordBreak: "break-all" }}>
              Document hash sha256 {fresh.docHash}
            </p>
          ) : null}
          <p className="t-secondary" style={{ marginTop: 12 }}>
            {fresh.depositStatus === "held"
              ? `Your deposit of ${formatMoney(fresh.depositCents)} is held, not charged. ${yardName} will check the gear in on ${fresh.dueBackOn} and release it the same day if nothing is damaged.`
              : `The deposit of ${formatMoney(fresh.depositCents)} has not been authorised yet. ${yardName} will be in touch to finish it.`}
          </p>
        </section>
      ) : fresh.status === "cancelled" ? (
        <section className="doc" style={{ marginTop: 20 }}>
          <p className="t-title">This quote was cancelled.</p>
          <p className="t-secondary" style={{ marginTop: 8 }}>
            Give {yardName} a call if that is not what you expected.
          </p>
        </section>
      ) : (
        <section className="doc" style={{ marginTop: 20 }}>
          <SignPad
            action={acceptQuoteAction}
            token={token}
            depositLabel={
              fresh.depositCents > 0 ? `a ${formatMoney(fresh.depositCents)} hold` : "the order"
            }
            simulated={depositsAreSimulated()}
            damageClause={settings.damageClause}
          />
        </section>
      )}

      <p className="t-secondary" style={{ marginTop: 24, textAlign: "center" }}>
        Quote #{fresh.number} from {yardName} · read on {formatDateLong(today)}
      </p>
    </main>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="between" style={{ minHeight: 28 }}>
      <span className={strong ? "t-title" : "t-secondary"}>{label}</span>
      <span className={strong ? "t-mono-lg" : "t-mono"}>{value}</span>
    </div>
  );
}

function Expired() {
  return (
    <main style={{ maxWidth: 480, margin: "0 auto", padding: "56px 20px" }}>
      <p className="t-placard tone-dim">RigRent</p>
      <h1 className="t-h2" style={{ marginTop: 8 }}>
        This quote link has expired
      </h1>
      <p className="t-secondary" style={{ marginTop: 12 }}>
        Quote links last 60 days, and a re-sent quote replaces the old link. Ask the yard to send you
        a fresh one — your quote is still on their screen.
      </p>
    </main>
  );
}

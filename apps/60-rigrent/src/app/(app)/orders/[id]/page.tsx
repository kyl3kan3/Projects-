/**
 * /orders/[id] — the order, whole (DESIGN.md screen 3), and the quote builder
 * while it is still a draft.
 *
 * Status ribbon, the window that drives everything, line rows with live chalk
 * gauges for that window, the overbooked block inline, totals and the deposit
 * state, the contract, the photo pairs, and the claims.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  AddLineForm,
  ClaimForm,
  DepositForm,
  NewClaimForm,
  WindowForm,
  LineQuantityForm,
} from "./OrderForms";
import {
  addClaimAction,
  addLineAction,
  cancelOrderAction,
  closeOrderAction,
  markOutAction,
  removeLineAction,
  retryHoldAction,
  sendQuoteAction,
  setDepositAction,
  setLineQuantityAction,
  setWindowAction,
  settleDepositAction,
  updateClaimAction,
  waiveClaimAction,
} from "../actions";
import { ActionForm } from "@/components/ActionForm";
import { ChalkGauge } from "@/components/ChalkGauge";
import { DepositPlacard, OrderPlacard, Placard } from "@/components/Placard";
import { IconAlert, IconDocument, IconHold } from "@/components/icons";
import { requireSession } from "@/lib/auth";
import { gaugeLines } from "@/lib/availability";
import { overbookedSentence } from "@/lib/availability-core";
import { evidenceFor, listClaims } from "@/lib/claims";
import { claimTotals, planSettlement } from "@/lib/claims-core";
import { formatDateWithDow, formatWindow } from "@/lib/dates";
import { depositsAreSimulated } from "@/lib/deposit-gateway";
import { holdSentence } from "@/lib/holds";
import { formatMoney } from "@/lib/money";
import { isEditable, nextAction } from "@/lib/order-core";
import { getOrder, todayFor } from "@/lib/orders";
import { canUseDamageClaims, canWrite, entitlements } from "@/lib/plans";
import { catalogue } from "@/lib/orders";
import { fileUrl } from "@/lib/storage";

export const metadata: Metadata = { title: "Order" };

export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { account } = await requireSession();
  const full = await getOrder(account.id, id);
  if (!full) notFound();

  const { order, customer, lines } = full;
  const today = todayFor(account);
  const ent = entitlements(account);
  const writeGate = canWrite(ent);
  const claimGate = canUseDamageClaims(ent);
  const editable = isEditable(order.status) && writeGate.allowed;

  const [gauges, items, claims, evidence] = await Promise.all([
    lines.length
      ? gaugeLines(
          account.id,
          order.outOn,
          order.dueBackOn,
          lines.map((l) => ({ itemId: l.itemId, quantity: l.quantity })),
          { excludeOrderId: order.id },
        )
      : Promise.resolve(new Map()),
    catalogue(account.id),
    listClaims(order.id),
    evidenceFor(order.id),
  ]);

  const overbooked = lines.filter((l) => gauges.get(l.itemId)?.gauge.overbooked);
  const totals = claimTotals(claims);
  const settlement = planSettlement(claims, order.depositCents);
  const hasPhotos = evidence.some((p) => p.outPhotos.length > 0 || p.inPhotos.length > 0);

  return (
    <main style={{ paddingBottom: 40 }}>
      <Link href="/orders" className="btn-quiet">
        Orders
      </Link>

      {/* --- ribbon --- */}
      <div className="between" style={{ marginTop: 12 }}>
        <div style={{ minWidth: 0 }}>
          <h1 className="t-h2">Order #{order.number}</h1>
          <Link
            href={`/customers/${customer.id}`}
            className="t-secondary"
            style={{ color: "var(--color-dim)" }}
          >
            {customer.name}
            {customer.company ? ` — ${customer.company}` : ""}
            {customer.taxExempt ? " · tax exempt" : ""}
          </Link>
        </div>
        <OrderPlacard order={order} today={today} />
      </div>

      <p className="t-mono tone-dim" style={{ marginTop: 8 }}>
        {formatWindow(order.outOn, order.dueBackOn)}
      </p>
      <p className="t-secondary" style={{ marginTop: 4 }}>
        {nextAction(order, today)}
      </p>

      {order.depositError ? (
        <div className="banner" data-tone="warn" style={{ marginTop: 16 }} role="alert">
          <IconAlert size={16} /> {order.depositError}
        </div>
      ) : null}

      {/* --- the overbooked block, inline --- */}
      {overbooked.length > 0 ? (
        <div className="overbooked" style={{ marginTop: 16 }} role="alert">
          <strong className="t-placard">Overbooked</strong>
          <div className="stack" style={{ gap: 6, marginTop: 6 }}>
            {overbooked.map((line) => {
              const g = gauges.get(line.itemId);
              if (!g) return null;
              return (
                <p key={line.id}>
                  {overbookedSentence(g.gauge, g.conflict)}
                  {g.conflict ? (
                    <>
                      {" "}
                      <Link href={`/orders/${g.conflict.orderId}`} className="btn-quiet">
                        Open #{g.conflict.orderNumber}
                      </Link>
                    </>
                  ) : null}
                </p>
              );
            })}
          </div>
        </div>
      ) : null}

      {/* --- lines with gauges --- */}
      <section style={{ marginTop: 32 }}>
        <h2 className="t-label">Gear on this order</h2>
        {lines.length === 0 ? (
          <p className="t-secondary" style={{ marginTop: 8 }}>
            No lines yet. Add the first one and its gauge will show what is free for these dates.
          </p>
        ) : (
          <div className="stack" style={{ marginTop: 8 }}>
            {lines.map((line) => {
              const g = gauges.get(line.itemId);
              return (
                <div key={line.id} className="row row-stack">
                  <div className="between" style={{ width: "100%" }}>
                    <div style={{ minWidth: 0 }}>
                      <p className="t-title">{line.itemName}</p>
                      <p className="t-mono tone-dim" style={{ marginTop: 2 }}>
                        {line.quantity} × {formatMoney(line.rateCents)} ={" "}
                        {formatMoney(line.lineTotalCents)}
                      </p>
                    </div>
                    {editable ? (
                      <LineQuantityForm
                        orderId={order.id}
                        lineId={line.id}
                        quantity={line.quantity}
                        action={setLineQuantityAction}
                        removeAction={removeLineAction}
                        disabled={!editable}
                      />
                    ) : (
                      <span className="t-mono-lg">{line.quantity}</span>
                    )}
                  </div>
                  {g ? (
                    <div style={{ width: "100%" }}>
                      <ChalkGauge facts={g.gauge} requested={line.quantity} />
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}

        {editable && items.length > 0 ? (
          <div style={{ marginTop: 20 }}>
            <AddLineForm
              orderId={order.id}
              items={items}
              action={addLineAction}
              disabled={!editable}
            />
          </div>
        ) : null}
      </section>

      {/* --- totals + deposit footer --- */}
      <section className="panel" style={{ marginTop: 32, padding: 16 }}>
        <Money label="Subtotal" cents={order.subtotalCents} />
        <Money
          label={customer.taxExempt ? "Tax (exempt)" : "Tax"}
          cents={order.taxCents}
        />
        <div className="hairline-t" style={{ margin: "8px 0" }} />
        <Money label="Total" cents={order.totalCents} strong />
        <div style={{ marginTop: 16 }}>
          <div className="between">
            <span className="t-label">Security deposit</span>
            <DepositPlacard
              status={order.depositStatus}
              amountLabel={formatMoney(order.depositCents)}
            />
          </div>
          <p className="t-secondary" style={{ marginTop: 8 }}>
            {holdSentence(order, today)}
          </p>
          {depositsAreSimulated() && order.depositStatus !== "none" ? (
            <p className="t-secondary tone-warn" style={{ marginTop: 4 }}>
              Simulated: no Stripe key is configured in this environment, so no card was contacted.
            </p>
          ) : null}
          {order.depositCapturedCents > 0 ? (
            <p className="t-mono" style={{ marginTop: 4 }}>
              Captured {formatMoney(order.depositCapturedCents)} of{" "}
              {formatMoney(order.depositCents)}
            </p>
          ) : null}
        </div>

        {editable && order.depositStatus === "none" ? (
          <div style={{ marginTop: 16 }}>
            <DepositForm
              orderId={order.id}
              depositCents={order.depositCents}
              action={setDepositAction}
              disabled={!editable}
            />
          </div>
        ) : null}
      </section>

      {/* --- contract and the customer link --- */}
      <section style={{ marginTop: 32 }}>
        <h2 className="t-label">Contract</h2>
        {order.signedAt ? (
          <div className="stack" style={{ marginTop: 8, gap: 8 }}>
            <p className="t-body">
              Signed by {order.signerName} on {formatDateWithDow(order.signedAt.toISOString().slice(0, 10))},
              initialled {order.signerInitials} on the damage clause.
            </p>
            {order.docHash ? (
              <p className="t-mono tone-dim" style={{ wordBreak: "break-all" }}>
                sha256 {order.docHash}
              </p>
            ) : null}
            {order.contractR2Key ? (
              /* A plain download link, not next/link: prefetch on hover would run
                 the GET, and a document route that logs an access is a route you
                 do not want fired by a mouse passing over it. */
              <a
                href={fileUrl(order.contractR2Key)}
                className="btn btn-secondary"
                style={{ alignSelf: "flex-start" }}
                download={`rigrent-order-${order.number}.pdf`}
              >
                <IconDocument />
                Download the signed contract
              </a>
            ) : null}
          </div>
        ) : (
          <p className="t-secondary" style={{ marginTop: 8 }}>
            Not signed yet. Sending the quote emails the customer a link where they read the terms,
            initial the damage clause, sign, and authorise the deposit hold.
          </p>
        )}
      </section>

      {/* --- lifecycle actions --- */}
      <section style={{ marginTop: 32 }}>
        <h2 className="t-label">What happens next</h2>
        <div className="stack" style={{ marginTop: 12, gap: 16 }}>
          {order.status === "draft" || order.status === "sent" ? (
            <ActionForm
              action={sendQuoteAction}
              submitLabel={order.status === "sent" ? "Re-send the quote" : "Send it to the customer"}
              pendingLabel="Sending…"
              disabled={!writeGate.allowed || lines.length === 0 || overbooked.length > 0}
              disabledReason={
                overbooked.length > 0
                  ? "Fix the overbooked line first — sending a quote you cannot fulfil is the whiteboard all over again."
                  : lines.length === 0
                    ? "Add at least one line."
                    : writeGate.reason
              }
            >
              <input type="hidden" name="orderId" value={order.id} />
            </ActionForm>
          ) : null}

          {/*
            The retry has to be reachable for every live status, not just
            `accepted`. A re-authorisation that fails leaves an order that is
            already OUT on the road with `deposit_status = none` — and the nightly
            sweep only looks at holds that are `held`, so nothing picks it up
            again. Without this control that order has no way back to a hold at
            all, which is the exposure the sweep existed to prevent.
          */}
          {order.depositCents > 0 &&
          (order.depositStatus === "none" || order.depositStatus === "expired") &&
          (order.status === "accepted" ||
            order.status === "confirmed" ||
            order.status === "out" ||
            order.status === "returned") ? (
            <ActionForm
              action={retryHoldAction}
              submitLabel={
                order.depositStatus === "expired"
                  ? "Re-authorise the deposit"
                  : "Start the deposit hold again"
              }
              variant="secondary"
              disabled={!writeGate.allowed}
            >
              <input type="hidden" name="orderId" value={order.id} />
              <p className="field-help">
                {order.depositStatus === "expired"
                  ? "The card authorisation ran out. This places a fresh one; the customer's quote link still works, and Stripe requires them to be told."
                  : "There is no live hold on this order — either the customer never finished the card step, or a re-authorisation failed. This re-opens it."}
              </p>
            </ActionForm>
          ) : null}

          {order.status === "confirmed" || order.status === "accepted" ? (
            <ActionForm
              action={markOutAction}
              submitLabel="Load it out"
              pendingLabel="Marking out…"
              disabled={!writeGate.allowed}
              disabledReason={writeGate.reason}
            >
              <input type="hidden" name="orderId" value={order.id} />
              <p className="field-help">
                Marks the gear as gone from the yard and puts the order on the returns queue for{" "}
                {formatDateWithDow(order.dueBackOn)}.
              </p>
            </ActionForm>
          ) : null}

          {order.status === "out" ? (
            <Link href="/returns" className="btn btn-primary btn-full">
              Check it in on the returns queue
            </Link>
          ) : null}

          {order.status === "returned" ? (
            <ActionForm
              action={settleDepositAction}
              submitLabel={
                settlement.releaseOnly
                  ? "Release the whole hold"
                  : `Capture ${formatMoney(settlement.captureCents)} and release the rest`
              }
              pendingLabel="Settling…"
              hold={!settlement.releaseOnly}
              disabled={!claimGate.allowed}
              disabledReason={claimGate.reason}
            >
              <input type="hidden" name="orderId" value={order.id} />
              <p className="field-help">
                {settlement.releaseOnly
                  ? "Nothing is claimed, so the whole authorisation is cancelled and no money moves."
                  : `${formatMoney(settlement.claimedCents)} claimed across ${settlement.chargeIds.length} claim(s). Stripe allows one capture per authorisation, so this settles the order in a single movement and releases ${formatMoney(settlement.releasedCents)}.`}
                {settlement.shortfallCents > 0
                  ? ` ${formatMoney(settlement.shortfallCents)} is above the hold and will have to be invoiced separately.`
                  : ""}
              </p>
            </ActionForm>
          ) : null}

          {order.status === "returned" && order.depositStatus !== "held" ? (
            <ActionForm action={closeOrderAction} submitLabel="Close the order" variant="secondary">
              <input type="hidden" name="orderId" value={order.id} />
            </ActionForm>
          ) : null}

          {order.status !== "closed" && order.status !== "cancelled" && order.status !== "out" ? (
            <ActionForm
              action={cancelOrderAction}
              submitLabel="Cancel the order"
              variant="danger"
              hold
              disabled={!writeGate.allowed}
            >
              <input type="hidden" name="orderId" value={order.id} />
              <p className="field-help">
                Releases any deposit hold and frees the gear back into availability. Nothing is
                deleted.
              </p>
            </ActionForm>
          ) : null}
        </div>
      </section>

      {/* --- window editor --- */}
      {editable ? (
        <section style={{ marginTop: 32 }}>
          <h2 className="t-label">Window and site</h2>
          <div style={{ marginTop: 12 }}>
            <WindowForm
              orderId={order.id}
              outOn={order.outOn}
              dueBackOn={order.dueBackOn}
              delivery={order.delivery}
              address={order.address}
              action={setWindowAction}
              disabled={!editable}
            />
          </div>
        </section>
      ) : (
        <section style={{ marginTop: 32 }}>
          <h2 className="t-label">Site</h2>
          <p className="t-body" style={{ marginTop: 8, whiteSpace: "pre-wrap" }}>
            {order.delivery
              ? (order.address ?? "Delivery, no address recorded")
              : "Customer pickup from the yard"}
          </p>
          {order.notes ? (
            <p className="t-secondary" style={{ marginTop: 8, whiteSpace: "pre-wrap" }}>
              {order.notes}
            </p>
          ) : null}
        </section>
      )}

      {/* --- photo pairs --- */}
      {hasPhotos || order.status === "out" || order.status === "returned" || order.status === "closed" ? (
        <section style={{ marginTop: 32 }}>
          <h2 className="t-label">Condition photos</h2>
          <p className="t-secondary" style={{ marginTop: 4 }}>
            What left the yard, and what came back. The damage claim is the difference between them.
          </p>
          <div className="stack" style={{ marginTop: 12, gap: 20 }}>
            {evidence.map((pair) => (
              <div key={pair.orderLineId}>
                <div className="between">
                  <p className="t-title">{pair.itemName}</p>
                  <span className="t-mono tone-dim">{pair.quantity} out</span>
                </div>
                <div className="pair" style={{ marginTop: 8 }}>
                  <PhotoSide
                    label="Out"
                    photos={pair.outPhotos}
                    counts={pair.outCheck}
                    empty="No out-photos. The driver's run sheet is where these get taken."
                  />
                  <PhotoSide
                    label="Back"
                    photos={pair.inPhotos}
                    counts={pair.inCheck}
                    empty="Not checked in yet."
                  />
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {/* --- claims --- */}
      {claims.length > 0 || order.status === "returned" || order.status === "closed" ? (
        <section style={{ marginTop: 32 }}>
          <div className="between">
            <h2 className="t-label">Damage claims</h2>
            {claims.length > 0 ? (
              <span className="t-mono tone-dim">
                {formatMoney(totals.draftCents)} draft · {formatMoney(totals.chargedCents)} charged
              </span>
            ) : null}
          </div>

          {claims.length === 0 ? (
            <p className="t-secondary" style={{ marginTop: 8 }}>
              Nothing claimed. A clean check-in releases the whole hold on its own.
            </p>
          ) : (
            <div className="stack" style={{ marginTop: 12, gap: 20 }}>
              {claims.map((claim) => (
                <div key={claim.id} className="panel" style={{ padding: 16 }}>
                  <div className="between">
                    <Placard
                      label={`${claim.kind} · ${claim.status}`}
                      tone={
                        claim.status === "waived"
                          ? "dim"
                          : claim.status === "charged"
                            ? "warn"
                            : "accent"
                      }
                    />
                    <span className="t-mono-lg tone-warn">{formatMoney(claim.amountCents)}</span>
                  </div>
                  <p className="t-title" style={{ marginTop: 8 }}>
                    {claim.itemName}
                  </p>
                  <p className="t-body" style={{ marginTop: 4 }}>
                    {claim.description}
                  </p>
                  {claim.photos.length > 0 ? (
                    <div className="photo-grid" style={{ marginTop: 12 }}>
                      {claim.photos.map((photo) => (
                        <span key={photo.id} className="photo">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={fileUrl(photo.r2Key)} alt={photo.caption ?? "Condition photo"} />
                          <span className="photo-caption">
                            {photo.caption ?? photo.takenAt.toISOString().slice(0, 16)}
                          </span>
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="t-secondary" style={{ marginTop: 8 }}>
                      No photos attached to this claim.
                    </p>
                  )}
                  {claim.status === "draft" ? (
                    <div style={{ marginTop: 16 }}>
                      <ClaimForm
                        orderId={order.id}
                        claimId={claim.id}
                        description={claim.description}
                        amountCents={claim.amountCents}
                        updateAction={updateClaimAction}
                        waiveAction={waiveClaimAction}
                        disabled={!claimGate.allowed}
                      />
                    </div>
                  ) : claim.stripeCaptureId ? (
                    <p className="t-mono tone-dim" style={{ marginTop: 8 }}>
                      capture {claim.stripeCaptureId}
                    </p>
                  ) : null}
                </div>
              ))}
            </div>
          )}

          {(order.status === "returned" || order.status === "closed") && lines.length > 0 ? (
            <div style={{ marginTop: 20 }}>
              <NewClaimForm
                orderId={order.id}
                lines={lines.map((l) => ({ id: l.id, itemName: l.itemName }))}
                action={addClaimAction}
                disabled={!claimGate.allowed}
                disabledReason={claimGate.reason}
              />
            </div>
          ) : null}
        </section>
      ) : null}

      {order.notes && editable ? (
        <p className="t-secondary" style={{ marginTop: 32, whiteSpace: "pre-wrap" }}>
          Crew notes: {order.notes}
        </p>
      ) : null}
    </main>
  );
}

function Money({ label, cents, strong }: { label: string; cents: number; strong?: boolean }) {
  return (
    <div className="between" style={{ minHeight: 28 }}>
      <span className={strong ? "t-title" : "t-secondary"}>{label}</span>
      <span className={strong ? "t-mono-lg" : "t-mono"}>{formatMoney(cents)}</span>
    </div>
  );
}

function PhotoSide({
  label,
  photos,
  counts,
  empty,
}: {
  label: string;
  photos: Array<{ id: string; r2Key: string; caption: string | null; takenAt: Date }>;
  counts: { quantityOk: number; quantityDamaged: number; quantityMissing: number } | null;
  empty: string;
}) {
  return (
    <div className="pair-side">
      <div className="between">
        <span className="t-label">{label}</span>
        {counts ? (
          <span className="t-mono tone-dim">
            {counts.quantityOk} ok
            {counts.quantityDamaged > 0 ? ` · ${counts.quantityDamaged} dmg` : ""}
            {counts.quantityMissing > 0 ? ` · ${counts.quantityMissing} missing` : ""}
          </span>
        ) : null}
      </div>
      {photos.length === 0 ? (
        <p className="photo-empty" style={{ marginTop: 8 }}>
          {empty}
        </p>
      ) : (
        <div className="photo-grid" style={{ marginTop: 8 }}>
          {photos.map((photo) => (
            <span key={photo.id} className="photo">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={fileUrl(photo.r2Key)} alt={photo.caption ?? `${label} condition photo`} />
              <span className="photo-caption">
                {photo.caption ?? photo.takenAt.toISOString().slice(0, 16).replace("T", " ")}
              </span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

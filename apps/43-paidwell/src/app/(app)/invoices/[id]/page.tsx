import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ScreenHeader } from "@/components/ScreenHeader";
import { PromiseChip } from "@/components/PromiseChip";
import { IconBanknoteIn, IconMail, IconReply } from "@/components/icons";
import { requireFirm } from "@/lib/auth";
import { loadInvoiceDetail } from "@/lib/dashboard";
import { addDays, compareIso, formatLongDate, formatStamp } from "@/lib/dates";
import { daysLabel } from "@/lib/display";
import { LEVEL_LABEL, offsetLabel, normalizeLadder } from "@/lib/ladder";
import { activeSequence } from "@/lib/sequences";
import { formatMoney } from "@/lib/money";
import type { EscalationLevel } from "@/db/schema";
import { InvoiceActionBar } from "./InvoiceActions";

export const metadata: Metadata = { title: "Invoice" };
export const dynamic = "force-dynamic";

export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { firm } = await requireFirm();
  const detail = await loadInvoiceDetail(firm, id);
  if (!detail) notFound();

  const sequence = await activeSequence(firm.id);
  const ladder = normalizeLadder(sequence.steps);
  const settled = detail.invoice.balanceCents <= 0;
  const sentByStep = new Map(detail.timeline.map((m) => [m.stepIndex, m]));
  const openPromise = detail.promiseRows.find((p) => p.status === "open") ?? null;
  const latestReply = detail.replyRows[detail.replyRows.length - 1] ?? null;

  const canSend =
    !settled &&
    detail.invoice.status !== "written_off" &&
    detail.invoice.status !== "disputed" &&
    detail.ladder.hold !== "ladder_complete" &&
    !firm.followUpPaused;

  return (
    <main>
      <ScreenHeader firmName={detail.client.name} meta={`${detail.invoice.number} · ${detail.stateLine}`} />

      <section className="gutter">
        <p className="t-label">{settled ? "Paid" : "Outstanding"}</p>
        <div style={{ display: "flex", alignItems: "baseline", gap: 16, flexWrap: "wrap" }}>
          <p className="t-stat" style={{ color: settled ? "var(--color-banker)" : undefined }}>
            {formatMoney(settled ? detail.invoice.amountCents : detail.invoice.balanceCents, detail.invoice.currency)}
          </p>
          <p className="t-data" style={{ fontSize: 15, color: "var(--color-text-2)" }}>
            {settled ? `PAID · ${detail.invoice.paidAt ? formatStamp(detail.invoice.paidAt) : "today"}` : daysLabel(detail.daysLate)}
          </p>
        </div>
        <p className="t-secondary" style={{ marginTop: 8 }}>
          Issued {formatLongDate(detail.invoice.issuedAt)} · due {formatLongDate(detail.invoice.dueAt)}
          {detail.invoice.amountCents !== detail.invoice.balanceCents && !settled
            ? ` · ${formatMoney(detail.invoice.amountCents - detail.invoice.balanceCents, detail.invoice.currency)} already paid`
            : ""}
        </p>
        {detail.client.vip ? (
          <p className="t-secondary" style={{ marginTop: 8, color: "var(--color-amber)" }}>
            {detail.client.name} is marked VIP — PaidWell never chases them automatically. Use
            &ldquo;send this step now&rdquo; when you want something to go.
          </p>
        ) : null}
        {detail.invoice.disputedNote ? (
          <p className="t-secondary" style={{ marginTop: 8, color: "var(--color-red)" }}>
            {detail.invoice.disputedNote}
          </p>
        ) : null}
      </section>

      {detail.promiseRows.length > 0 ? (
        <section className="gutter" style={{ marginTop: 24 }}>
          <p className="t-label" style={{ marginBottom: 8 }}>
            Promises
          </p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {detail.promiseRows.map((promise) => (
              <PromiseChip key={promise.id} status={promise.status} promisedFor={promise.promisedFor} />
            ))}
          </div>
        </section>
      ) : null}

      <section className="gutter" style={{ marginTop: 32 }}>
        <p className="t-label" style={{ marginBottom: 12 }}>
          The ladder
        </p>
        <p className="t-secondary" style={{ marginBottom: 16 }}>
          {detail.ladder.label}
        </p>

        <ol style={{ position: "relative", paddingLeft: 24, listStyle: "none" }}>
          <span
            aria-hidden="true"
            style={{
              position: "absolute",
              left: 5,
              top: 8,
              bottom: 8,
              width: 1,
              background: "var(--color-hairline)",
            }}
          />
          {ladder.map((step, index) => {
            const message = sentByStep.get(index);
            const isNext = !message && index === detail.ladder.stepsSent && !settled;
            const rungDate = addDays(detail.invoice.dueAt, step.offsetDaysFromDue);
            return (
              <li key={index} style={{ position: "relative", paddingBottom: 20 }}>
                <span
                  aria-hidden="true"
                  style={{
                    position: "absolute",
                    left: -24,
                    top: 4,
                    width: 11,
                    height: 11,
                    borderRadius: 999,
                    background: message ? "var(--color-ink)" : "var(--color-ledger)",
                    border: isNext
                      ? "2px solid var(--color-amber)"
                      : message
                        ? "2px solid var(--color-ink)"
                        : "1px solid var(--color-hairline)",
                  }}
                />
                <p className="t-label">
                  Step {index + 1} · {offsetLabel(step.offsetDaysFromDue)} ·{" "}
                  {LEVEL_LABEL[step.escalationLevel as EscalationLevel]}
                </p>
                {message ? (
                  <>
                    <p className="t-title" style={{ marginTop: 4 }}>
                      {message.subject}
                    </p>
                    <p className="t-data" style={{ color: "var(--color-text-aa)", marginTop: 4 }}>
                      {message.status === "awaiting_approval"
                        ? "waiting for your approval"
                        : `${message.status}${message.sentAt ? ` · ${formatStamp(message.sentAt.toISOString().slice(0, 10))}` : ""}`}
                      {message.promiseAware ? " · promise-aware" : ""}
                    </p>
                    {message.error ? (
                      <p className="t-secondary" style={{ color: "var(--color-red)", marginTop: 4 }}>
                        {message.error}
                      </p>
                    ) : null}
                  </>
                ) : (
                  <p className="t-secondary" style={{ marginTop: 4 }}>
                    {settled
                      ? "not needed — settled first"
                      : index < detail.ladder.stepsSent
                        ? `skipped — by ${formatLongDate(detail.asOf)} a firmer step was the honest one to send`
                        : compareIso(rungDate, detail.asOf) < 0
                          ? `passed ${formatLongDate(rungDate)} — the ladder will not go back`
                          : `${isNext ? "next" : "scheduled"} for ${formatLongDate(rungDate)}`}
                  </p>
                )}
              </li>
            );
          })}
        </ol>
      </section>

      {detail.replyRows.length > 0 ? (
        <section className="gutter" style={{ marginTop: 8 }}>
          <p className="t-label" style={{ marginBottom: 8 }}>
            Replies
          </p>
          {detail.replyRows.map((reply) => (
            <div key={reply.id} className="row" style={{ alignItems: "flex-start" }}>
              <IconReply size={18} style={{ color: "var(--color-text-2)", marginTop: 4 }} />
              <div style={{ flex: 1 }}>
                <p className="t-title">{reply.fromEmail}</p>
                <p className="t-secondary" style={{ marginTop: 2 }}>
                  {reply.snippet.slice(0, 240)}
                </p>
                {reply.suggestedPromiseFor ? (
                  <p className="t-secondary" style={{ marginTop: 4, color: "var(--color-amber)" }}>
                    Looks like they mean {formatLongDate(reply.suggestedPromiseFor)} — log it as a
                    promise below if that is right. PaidWell will not assume it.
                  </p>
                ) : null}
              </div>
            </div>
          ))}
        </section>
      ) : null}

      {detail.paymentRows.length > 0 ? (
        <section className="gutter" style={{ marginTop: 24 }}>
          <p className="t-label" style={{ marginBottom: 8 }}>
            Payments
          </p>
          {detail.paymentRows.map((payment) => (
            <div key={payment.id} className="row">
              <IconBanknoteIn size={18} style={{ color: "var(--color-banker)" }} />
              <span style={{ flex: 1 }}>
                <span className="t-title" style={{ display: "block" }}>
                  {formatMoney(payment.amountCents, detail.invoice.currency)}
                </span>
                <span className="t-secondary" style={{ color: "var(--color-text-aa)" }}>
                  {payment.method} · {formatLongDate(payment.paidAt)}
                  {payment.recordedToAccountingAt ? " · written back" : " · write-back pending"}
                </span>
              </span>
            </div>
          ))}
        </section>
      ) : null}

      <section className="gutter" style={{ marginTop: 32, marginBottom: 40 }}>
        {!detail.planAllowsPromises ? (
          <p className="t-secondary" style={{ marginBottom: 12 }}>
            Promise tracking is a Firm-plan feature, but a promise logged here still pauses the
            ladder — a safety rail is not something to sell.{" "}
            <Link href="/settings/billing" style={{ color: "var(--color-banker)", fontWeight: 600 }}>
              See plans
            </Link>
          </p>
        ) : null}
        <InvoiceActionBar
          invoiceId={detail.invoice.id}
          canSend={canSend}
          sendLabel={
            detail.ladder.hold === "ladder_complete"
              ? "Every step has been sent"
              : firm.sendMode === "approval"
                ? "Queue the next step now"
                : "Send the next step now"
          }
          isPaused={Boolean(openPromise) || detail.run?.state === "paused_reply"}
          isStopped={detail.run?.state === "stopped"}
          canPromise={!settled}
          suggestedDate={latestReply?.suggestedPromiseFor ?? addDays(detail.asOf, 7)}
          today={detail.asOf}
        />
      </section>

      <section className="gutter" style={{ marginBottom: 40 }}>
        <div className="panel" style={{ padding: 16, display: "flex", gap: 12, alignItems: "flex-start" }}>
          <IconMail size={20} style={{ color: "var(--color-text-aa)", flex: "none" }} />
          <p className="t-secondary">
            Follow-ups go to {detail.client.emails.length ? detail.client.emails.join(", ") : "nobody — this client has no email on file"}
            {firm.senderVerified && firm.senderDomain
              ? `, from billing@${firm.senderDomain}.`
              : ", from our address with your firm's name and reply-to until you verify a sending domain."}
          </p>
        </div>
      </section>
    </main>
  );
}

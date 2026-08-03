import type { Metadata } from "next";
import { headers } from "next/headers";
import { AcceptPanel } from "./AcceptPanel";
import { DEFAULT_TERMS, loadProposal, recordView } from "@/lib/proposals";
import { formatMoney } from "@/lib/money";
import { quantityLabel } from "@/lib/item-fields";
import { longDate } from "@/lib/display";
import { verifyProposalToken } from "@/lib/tokens";

export const metadata: Metadata = {
  title: "Your proposal",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

/**
 * The hosted proposal — what the homeowner opens from the email.
 *
 * Light theme, no product chrome, no login: it should read like fine paperwork from
 * a contractor who has their act together, not like an app. The signed token in the
 * URL is the credential, and every failure state is a sentence a customer can act
 * on rather than an error code.
 */
export default async function PublicProposalPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const verified = await verifyProposalToken(token);

  if (!verified.ok) {
    const copy = {
      expired: {
        title: "This proposal has expired",
        body: "Quotes are held for 30 days so prices stay honest. Your contractor can send a fresh link in a couple of taps — just reply to their email or give them a call.",
      },
      revoked: {
        title: "There is a newer version of this proposal",
        body: "Your contractor re-sent it, which replaced this link. Open the most recent email from them and you will see the current numbers.",
      },
      withdrawn: {
        title: "This proposal was withdrawn",
        body: "Your contractor took it back — usually because something about the job changed. Reach out to them and they will re-quote it.",
      },
      invalid: {
        title: "This link does not open a proposal",
        body: "It may have been truncated by an email client. Try opening it from the original email, or ask your contractor to send it again.",
      },
    }[verified.reason];

    return (
      <main className="paper-page">
        <div className="gutter" style={{ maxWidth: 640, margin: "0 auto", paddingTop: 56 }}>
          <p className="t-label">QuoteFox</p>
          <h1 className="t-h2" style={{ marginTop: 12 }}>
            {copy.title}
          </h1>
          <p className="t-body" style={{ marginTop: 12, maxWidth: "46ch" }}>
            {copy.body}
          </p>
        </div>
      </main>
    );
  }

  const bundle = await loadProposal(verified.proposal.id);
  if (!bundle) {
    return (
      <main className="paper-page">
        <div className="gutter" style={{ maxWidth: 640, margin: "0 auto", paddingTop: 56 }}>
          <h1 className="t-h2">This proposal is no longer available</h1>
        </div>
      </main>
    );
  }

  // First view flips the status and notifies the contractor; later views only
  // append to the timeline.
  const headerBag = await headers();
  await recordView(bundle.proposal.id, {
    userAgent: headerBag.get("user-agent"),
    ip: headerBag.get("x-forwarded-for"),
  });

  // Stable URLs, not presigned ones: see the note in the photo route. A URL with a
  // clock-derived expiry in it differs between the HTML and RSC renders of the same
  // page, which React reports as a hydration mismatch.
  const photos = bundle.photos.slice(0, 8).map((photo) => ({
    id: photo.id,
    caption: photo.caption,
    url: `/p/${token}/photo/${photo.id}`,
  }));

  const accepted = Boolean(bundle.proposal.acceptedAt);
  const depositPaid = bundle.proposal.status === "deposit_paid";
  const brand = bundle.org.brandColor || "#CD7A29";

  return (
    <main className="paper-page">
      <div className="gutter" style={{ maxWidth: 640, margin: "0 auto", paddingBottom: 64 }}>
        {/* ---- letterhead ---- */}
        <header style={{ paddingTop: 32, paddingBottom: 24 }}>
          <p className="t-label" style={{ color: brand }}>
            {bundle.org.name}
          </p>
          <h1 className="t-h2" style={{ marginTop: 10 }}>
            Proposal for {bundle.job.title}
          </h1>
          <p className="t-secondary" style={{ marginTop: 8 }}>
            Prepared for {bundle.job.customerName} · {bundle.job.address}
          </p>
          <p className="t-secondary" style={{ marginTop: 4 }}>
            {longDate(bundle.proposal.sentAt)} · valid through {longDate(bundle.proposal.expiresAt)}
          </p>
        </header>

        <div className="rule" />

        {/* ---- license block ---- */}
        <section style={{ paddingTop: 20, paddingBottom: 24 }}>
          <p className="t-label">Who is doing the work</p>
          <p className="t-body" style={{ marginTop: 8 }}>
            {bundle.org.name}
            {bundle.org.licenseNumber ? ` · License ${bundle.org.licenseNumber}` : ""}
          </p>
          <p className="t-secondary" style={{ marginTop: 4 }}>
            {[bundle.org.insuranceLine, bundle.org.phone, bundle.org.address]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </section>

        {/* ---- scope ---- */}
        {bundle.proposal.scopeSummary ? (
          <section style={{ paddingBottom: 24 }}>
            <p className="t-label">Scope</p>
            <p className="t-body" style={{ marginTop: 8 }}>
              {bundle.proposal.scopeSummary}
            </p>
          </section>
        ) : null}

        {/* ---- photos ---- */}
        {photos.length ? (
          <section style={{ paddingBottom: 24 }}>
            <p className="t-label" style={{ paddingBottom: 12 }}>
              From the walkthrough
            </p>
            <div className="scroll-x" style={{ display: "flex", gap: 12 }}>
              {photos.map((photo) => (
                <figure key={photo.id} style={{ margin: 0, width: 180, flex: "none" }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={photo.url}
                    alt={photo.caption ?? "Photo from the walkthrough"}
                    style={{
                      width: 180,
                      height: 180,
                      objectFit: "cover",
                      borderRadius: 12,
                      border: "1px solid var(--color-paper-line)",
                    }}
                  />
                  {photo.caption ? (
                    <figcaption className="t-secondary" style={{ marginTop: 8 }}>
                      {photo.caption}
                    </figcaption>
                  ) : null}
                </figure>
              ))}
            </div>
          </section>
        ) : null}

        {/* ---- line items ---- */}
        <section style={{ paddingBottom: 8 }}>
          <p className="t-label" style={{ paddingBottom: 4 }}>
            What is included
          </p>
          {bundle.lines.map((line) => (
            <div key={line.id} className="row">
              <span style={{ flex: 1, minWidth: 0 }}>
                <span className="t-title" style={{ display: "block" }}>
                  {line.name}
                </span>
                <span className="t-secondary" style={{ display: "block", marginTop: 2 }}>
                  {quantityLabel(line.quantityMilli, line.unit)} × {formatMoney(line.unitPriceCents)}
                  {line.description ? ` · ${line.description}` : ""}
                </span>
              </span>
              <span className="t-data" style={{ flex: "none", fontSize: 14 }}>
                {formatMoney(line.lineTotalCents)}
              </span>
            </div>
          ))}
        </section>

        {/* ---- totals ---- */}
        <section style={{ paddingTop: 20, paddingBottom: 24 }}>
          <div style={{ display: "flex", justifyContent: "space-between", paddingBottom: 8 }}>
            <span className="t-secondary">Subtotal</span>
            <span className="t-data">{formatMoney(bundle.estimate.subtotalCents)}</span>
          </div>
          {bundle.estimate.taxCents > 0 ? (
            <div style={{ display: "flex", justifyContent: "space-between", paddingBottom: 8 }}>
              <span className="t-secondary">
                Sales tax ({(bundle.estimate.taxRateBp / 100).toFixed(2)}% on materials)
              </span>
              <span className="t-data">{formatMoney(bundle.estimate.taxCents)}</span>
            </div>
          ) : null}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "baseline",
              paddingTop: 12,
              borderTop: "1px solid var(--color-paper-line)",
            }}
          >
            <span className="t-title">Total</span>
            <span
              className="t-data"
              style={{ fontSize: 24, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}
            >
              {formatMoney(bundle.proposal.totalCents)}
            </span>
          </div>
          {bundle.proposal.depositCents > 0 ? (
            <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 8 }}>
              <span className="t-secondary">Deposit to start</span>
              <span className="t-data">{formatMoney(bundle.proposal.depositCents)}</span>
            </div>
          ) : null}
        </section>

        {/* ---- accept ---- */}
        <section style={{ paddingBottom: 32 }}>
          <AcceptPanel
            token={token}
            companyName={bundle.org.name}
            depositCents={bundle.proposal.depositCents}
            totalCents={bundle.proposal.totalCents}
            terms={bundle.proposal.termsText ?? DEFAULT_TERMS}
            accepted={accepted}
            acceptedByName={bundle.proposal.acceptedByName}
            depositPaid={depositPaid}
          />
        </section>

        <div className="rule" />
        <footer style={{ paddingTop: 16 }}>
          <p className="t-secondary">
            Every line above is priced from {bundle.org.name}'s own price book. Questions about any of
            them? Reply to the email this link came from.
          </p>
        </footer>
      </div>
    </main>
  );
}

import type { Metadata } from "next";
import { ActionForm } from "@/components/ActionForm";
import { IconDownload, IconQuestion } from "@/components/icons";
import { divisionLabel } from "@/lib/csi";
import { daysUntil, fileSize, money, plainDate } from "@/lib/format";
import {
  loadPortalView,
  markPortalOpened,
  portalRateLimit,
  resolvePortal,
} from "@/lib/portal";
import { TOKEN_REJECTION_COPY } from "@/lib/portal-tokens";
import { BidForm } from "./BidForm";
import { askQuestionAction, attachAction, declineAction, removeAttachmentAction, willBidAction } from "./actions";

export const metadata: Metadata = {
  title: "Bid package",
  robots: { index: false, follow: false },
};

/**
 * The sub portal. One page, no login, no nav, light theme — read in a truck.
 *
 * Everything on this screen comes from `resolvePortal(token)`. The route parameter is
 * a signed token, not an id, and no query parameter or form field can widen what it
 * reaches. A sibling bidder's numbers are not merely hidden here; they are never
 * loaded.
 */
export default async function PortalPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const resolved = await resolvePortal(token);

  if (!resolved.ok) {
    return (
      <main className="portal screen" style={{ paddingBottom: "var(--s10)" }}>
        <div className="gutter" style={{ paddingBlock: "var(--s9)", maxWidth: 520, margin: "0 auto" }}>
          <p className="t-label">BIDBOARD</p>
          <h1 className="t-h2" style={{ marginTop: "var(--s4)" }}>
            This link is not open
          </h1>
          <p className="t-body" style={{ marginTop: "var(--s3)" }}>
            {TOKEN_REJECTION_COPY[resolved.reason]}
          </p>
          <p className="t-secondary" style={{ marginTop: "var(--s5)" }}>
            Bid links are personal to your company and expire after the bid date. Nothing you sent
            through one is ever shown to another bidder.
          </p>
        </div>
      </main>
    );
  }

  const ctx = resolved.ctx;
  if (!portalRateLimit(ctx.invitationId)) {
    return (
      <main className="portal screen">
        <div className="gutter" style={{ paddingBlock: "var(--s9)", maxWidth: 520, margin: "0 auto" }}>
          <h1 className="t-h2">Give it a minute</h1>
          <p className="t-body" style={{ marginTop: "var(--s3)" }}>
            This link has been opened a lot in the last minute. Try again shortly.
          </p>
        </div>
      </main>
    );
  }

  await markPortalOpened(ctx);
  const view = await loadPortalView(ctx);

  const days = daysUntil(ctx.project.bidDueAt);
  const declined = ctx.invitation.declinedAt !== null;
  const submitted = view.submitted;
  const working = view.working;

  return (
    <main className="portal screen" style={{ paddingBottom: "var(--s10)" }}>
      <div className="wrap" style={{ maxWidth: 640 }}>
        {/* ------------------------------------------------------------ header --- */}
        <header className="gutter hairline-b" style={{ paddingBlock: "var(--s5)" }}>
          <p className="t-label">{ctx.company.name.toUpperCase()} · BID REQUEST</p>
          <h1 className="t-h2" style={{ marginTop: "var(--s3)" }}>
            {ctx.project.name}
          </h1>
          {ctx.project.address ? (
            <p className="t-secondary" style={{ marginTop: "var(--s1)" }}>
              {ctx.project.address}
            </p>
          ) : null}
          <p className="t-data" style={{ marginTop: "var(--s3)", color: "var(--fg-2)" }}>
            {ctx.pkg.csiDivision} · {divisionLabel(ctx.pkg.csiDivision).toUpperCase()}
          </p>
          <p className="t-body" style={{ marginTop: "var(--s3)" }}>
            {days > 1
              ? `Bids due ${plainDate(ctx.project.bidDueAt)} — ${days} days left.`
              : days === 1
                ? `Bids due tomorrow, ${plainDate(ctx.project.bidDueAt)}.`
                : days === 0
                  ? `Bids due today.`
                  : `The bid date (${plainDate(ctx.project.bidDueAt)}) has passed.`}
          </p>
          <p className="t-secondary" style={{ marginTop: "var(--s3)" }}>
            You are bidding as <strong>{ctx.subCompany.name}</strong> ({ctx.subContact.email}). No
            account, no password — this link is yours.
          </p>
        </header>

        {/* --------------------------------------------------------- the scope --- */}
        {ctx.invitation.personalNote ? (
          <section className="gutter" style={{ paddingTop: "var(--s5)" }}>
            <div className="notice notice-accent">{ctx.invitation.personalNote}</div>
          </section>
        ) : null}

        {ctx.pkg.scopeNotes ? (
          <section className="gutter" style={{ paddingTop: "var(--s5)" }}>
            <h2 className="t-label">Scope</h2>
            <p className="t-body" style={{ marginTop: "var(--s2)", whiteSpace: "pre-wrap" }}>
              {ctx.pkg.scopeNotes}
            </p>
          </section>
        ) : null}

        {ctx.company.settings.portalNote ? (
          <section className="gutter" style={{ paddingTop: "var(--s4)" }}>
            <p className="t-secondary">{ctx.company.settings.portalNote}</p>
          </section>
        ) : null}

        {/* ------------------------------------------------------------- plans --- */}
        <section className="gutter" style={{ paddingTop: "var(--s6)" }}>
          <h2 className="t-label">Plans &amp; specs</h2>
          {view.plans.length === 0 ? (
            <p className="t-secondary" style={{ marginTop: "var(--s2)" }}>
              No drawings posted for this package. Bid the scope above, and ask a question below if
              you need a sheet.
            </p>
          ) : (
            <div className="rows" style={{ marginTop: "var(--s3)" }}>
              {view.plans.map((f) => (
                <a
                  key={f.id}
                  className="row"
                  href={`/bid/${token}/plans/${f.id}`}
                  download={f.filename}
                >
                  <span className="stack" style={{ gap: 2, flex: 1, minWidth: 0 }}>
                    <span className="t-title" style={{ fontSize: 15 }}>
                      {f.filename}
                    </span>
                    <span className="t-data" style={{ color: "var(--fg-2)", fontSize: 12 }}>
                      {f.versionLabel.toUpperCase()} · {fileSize(f.bytes)}
                      {f.supersededAt ? " · SUPERSEDED" : ""}
                    </span>
                  </span>
                  <IconDownload size={20} />
                </a>
              ))}
            </div>
          )}
        </section>

        {/* ---------------------------------------------------- bid or decline --- */}
        {declined ? (
          <section className="gutter" style={{ paddingTop: "var(--s6)" }}>
            <div className="notice">
              <p className="t-title">You told {ctx.company.name} you are not bidding this one.</p>
              {ctx.invitation.declineReason ? (
                <p style={{ marginTop: "var(--s2)" }}>
                  &ldquo;{ctx.invitation.declineReason}&rdquo;
                </p>
              ) : null}
              <p style={{ marginTop: "var(--s2)" }}>
                Changed your mind? Mark yourself as bidding and the form comes back.
              </p>
            </div>
            <div style={{ marginTop: "var(--s4)" }}>
              <ActionForm
                action={willBidAction}
                submitLabel="Actually, I will bid"
                variant="secondary"
                hiddenFields={{ token }}
              />
            </div>
          </section>
        ) : (
          <section className="gutter" style={{ paddingTop: "var(--s6)" }}>
            <h2 className="t-label">Your bid</h2>
            {submitted ? (
              <div className="notice notice-ok" style={{ marginTop: "var(--s3)" }}>
                Submitted {submitted.bid.submittedAt ? plainDate(submitted.bid.submittedAt) : ""} at{" "}
                {money(submitted.bid.totalCents)}
                {submitted.bid.revision > 1 ? ` (revision ${submitted.bid.revision})` : ""}. You can
                still revise it — the earlier version stays on the record.
              </div>
            ) : (
              <p className="t-secondary" style={{ marginTop: "var(--s2)" }}>
                Price the lines {ctx.company.name} listed, or send one lump sum. Either is a real
                answer. Your numbers are never shown to another bidder.
              </p>
            )}

            <div style={{ marginTop: "var(--s5)" }}>
              <BidForm
                token={token}
                formLines={view.formLines.map((f) => ({
                  id: f.id,
                  description: f.description,
                  unit: f.unit,
                  quantity: f.quantity,
                  isAlternate: f.isAlternate,
                  isAllowance: f.isAllowance,
                }))}
                existing={working?.lines ?? []}
                existingKind={working?.bid.kind ?? "itemized"}
                existingTotalCents={working?.bid.totalCents ?? 0}
                notes={working?.bid.notes ?? null}
                inclusions={working?.bid.inclusions ?? []}
                exclusions={working?.bid.exclusions ?? []}
                readOnly={!ctx.acceptingBids}
                submittedRevision={submitted?.bid.revision ?? null}
              />
            </div>

            {/* ------------------------------------------------- attachments --- */}
            {ctx.acceptingBids ? (
              <div style={{ marginTop: "var(--s7)" }}>
                <h3 className="t-label">Attach your own breakdown</h3>
                <p className="t-secondary" style={{ marginTop: "var(--s2)" }}>
                  Optional, and it does not replace the form — but if you have a proposal PDF, send
                  it along.
                </p>
                {(working?.attachments ?? []).length > 0 ? (
                  <div className="rows" style={{ marginTop: "var(--s3)" }}>
                    {(working?.attachments ?? []).map((a) => (
                      <div key={a.id} className="row">
                        <span className="stack" style={{ gap: 2, flex: 1, minWidth: 0 }}>
                          <span className="t-body" style={{ fontSize: 15 }}>
                            {a.filename}
                          </span>
                          <span className="t-data" style={{ fontSize: 12, color: "var(--fg-2)" }}>
                            {fileSize(a.bytes)}
                          </span>
                        </span>
                        <ActionForm
                          action={removeAttachmentAction}
                          submitLabel="Remove"
                          variant="quiet"
                          compact
                          hiddenFields={{ token, attachmentId: a.id }}
                        />
                      </div>
                    ))}
                  </div>
                ) : null}
                <div style={{ marginTop: "var(--s3)" }}>
                  <ActionForm
                    action={attachAction}
                    submitLabel="Attach"
                    variant="secondary"
                    pendingLabel="Uploading…"
                    hiddenFields={{ token }}
                  >
                    <input
                      className="input"
                      type="file"
                      name="file"
                      accept=".pdf,.xlsx,.csv,.docx,.png,.jpg,.jpeg,.zip"
                      style={{ paddingBlock: 12 }}
                    />
                  </ActionForm>
                </div>
              </div>
            ) : null}

            {/* ---------------------------------------------------- decline --- */}
            {ctx.acceptingBids && !submitted ? (
              <details style={{ marginTop: "var(--s7)" }}>
                <summary className="btn-quiet">Not bidding this one?</summary>
                <p className="t-secondary" style={{ marginTop: "var(--s2)" }}>
                  One tap and {ctx.company.name} stops chasing you. It costs you nothing and they
                  will remember it.
                </p>
                <div style={{ marginTop: "var(--s3)" }}>
                  <ActionForm
                    action={declineAction}
                    submitLabel="I am not bidding"
                    variant="secondary"
                    hiddenFields={{ token }}
                  >
                    <input
                      className="input"
                      name="reason"
                      maxLength={500}
                      placeholder="Booked through July — thanks for the invite"
                    />
                  </ActionForm>
                </div>
              </details>
            ) : null}
          </section>
        )}

        {/* --------------------------------------------------------------- Q&A --- */}
        <section className="gutter" style={{ paddingTop: "var(--s7)" }}>
          <h2 className="t-label">
            <IconQuestion size={16} /> Questions
          </h2>
          <p className="t-secondary" style={{ marginTop: "var(--s2)" }}>
            Answers go to every bidder on this trade, so nobody gets an edge. Who asked is not shared.
          </p>

          {view.questions.length > 0 ? (
            <div className="rows" style={{ marginTop: "var(--s4)" }}>
              {view.questions.map((q) => (
                <div key={q.id} className="stack" style={{ gap: "var(--s2)", paddingBlock: "var(--s4)" }}>
                  <span className="t-label">
                    {q.mine ? "YOU ASKED" : "A BIDDER ASKED"} · {plainDate(q.createdAt).toUpperCase()}
                  </span>
                  <p className="t-body">{q.body}</p>
                  {q.answerBody ? (
                    <div
                      style={{
                        marginLeft: "var(--s4)",
                        paddingLeft: "var(--s3)",
                        borderLeft: "2px solid var(--accent)",
                      }}
                    >
                      <p className="t-body">{q.answerBody}</p>
                      <p className="t-label" style={{ marginTop: "var(--s2)" }}>
                        ANSWERED TO ALL BIDDERS
                      </p>
                    </div>
                  ) : (
                    <p className="t-secondary">Waiting on {ctx.company.name}.</p>
                  )}
                </div>
              ))}
            </div>
          ) : null}

          {ctx.acceptingBids ? (
            <div style={{ marginTop: "var(--s4)" }}>
              <ActionForm
                action={askQuestionAction}
                submitLabel="Send question"
                variant="secondary"
                hiddenFields={{ token }}
              >
                <textarea
                  className="textarea"
                  name="body"
                  required
                  maxLength={2000}
                  placeholder="Is the fire alarm in this package or is 28 buying it out separately?"
                />
              </ActionForm>
            </div>
          ) : null}
        </section>

        <footer className="gutter hairline-t" style={{ marginTop: "var(--s8)", paddingBlock: "var(--s6)" }}>
          <p className="t-secondary">
            Bid requested via BidBoard. Your numbers are never shown to other bidders, never shared
            with another general contractor, and never sold. Every time this link is opened it is
            logged — that record is what protects your pricing.
          </p>
        </footer>
      </div>
    </main>
  );
}

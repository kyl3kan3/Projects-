/**
 * /liens/[id] — the lien case (DESIGN.md screen 6).
 *
 * The timeline rail full-height, with each step's action beneath it and the hard
 * stop rendered as a sentence in lien-card: "Earliest permitted sale date not before
 * June 28, 2026 — Tex. Prop. Code § 59.044". The disabled button is part of the
 * design.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PacketForm, ResolveForm, StepActions } from "@/app/(console)/liens/[id]/CaseForms";
import { LienRail } from "@/components/LienRail";
import { requireOwner } from "@/lib/auth";
import { delinquencyFor } from "@/lib/ledger";
import { caseById } from "@/lib/lien";
import { formatDateLong, formatMoney, isoDateOf } from "@/lib/money";
import { noticesForCase, noticeKindLabel } from "@/lib/notices";
import { documentUrl } from "@/lib/storage";
import { ownedTenancy } from "@/lib/tenancy";

export const metadata: Metadata = { title: "Lien file" };

export default async function LienCasePage({ params }: { params: Promise<{ id: string }> }) {
  const { owner } = await requireOwner();
  const { id } = await params;
  const found = await caseById(id);
  if (!found) notFound();
  const ctx = await ownedTenancy(owner.id, found.lienCase.tenancyId);
  if (!ctx) notFound();

  const asOf = isoDateOf(new Date());
  const delq = await delinquencyFor(ctx.tenancy.id, asOf);
  const documents = await noticesForCase(id);
  const live = found.lienCase.status === "open" || found.lienCase.status === "sale_eligible";

  return (
    <main style={{ padding: "20px 20px 40px", maxWidth: 680 }}>
      <Link href="/liens" className="t-secondary">
        ← Lien files
      </Link>

      <div className="flex items-baseline justify-between gap-3" style={{ marginTop: 8 }}>
        <h1 className="t-h2">
          <span className="t-mono-lg">{ctx.unit.label}</span> · {ctx.tenant.name}
        </h1>
        <span
          className="placard"
          data-tone={found.lienCase.status === "sale_eligible" ? "lien" : live ? "overdue" : "paid"}
        >
          {found.lienCase.status.replace(/_/g, " ")}
        </span>
      </div>

      <p className="t-secondary" style={{ marginTop: 4 }}>
        {ctx.facility.name} · {found.rule.state} rule pack v{found.rule.version}, reviewed{" "}
        {found.rule.reviewedOn} · delinquent since {found.lienCase.delinquentSince}
      </p>
      <p className="t-mono-lg" style={{ marginTop: 12 }}>
        Balance {formatMoney(delq.outstandingCents)}
      </p>
      <p className="rail-stop" style={{ marginTop: 8 }}>
        Sale eligible {formatDateLong(found.timeline.saleEligibleOn)} — not before.
      </p>

      <section className="hairline-t" style={{ marginTop: 24, paddingTop: 20 }}>
        <h2 className="t-label">Statutory sequence</h2>
        <div style={{ marginTop: 16 }}>
          <LienRail
            steps={found.timeline.steps}
            actionFor={(step) =>
              step.completedOn || !live ? null : step.current ? (
                <StepActions
                  lienCaseId={id}
                  stepKey={step.key}
                  locked={step.locked}
                  lockSentence={step.lockSentence}
                  hasNotice={Boolean(step.noticeR2Key)}
                  needsCertifiedMail={step.requires.includes("certified_mail")}
                  needsPublication={step.requires.includes("publication")}
                />
              ) : null
            }
          />
        </div>
      </section>

      <section className="hairline-t" style={{ marginTop: 8, paddingTop: 20 }}>
        <h2 className="t-label">Documents on this case</h2>
        {documents.length === 0 ? (
          <p className="t-secondary" style={{ marginTop: 8 }}>
            None yet. Generate the notice for the current step above.
          </p>
        ) : (
          <ul style={{ listStyle: "none", padding: 0, marginTop: 8 }}>
            {documents.map((doc) => {
              const via = (doc.sentVia ?? {}) as { certified?: boolean; trackingNumber?: string };
              return (
                <li className="row" key={doc.id}>
                  <span style={{ flex: 1 }}>
                    <span className="t-title">{noticeKindLabel(doc.kind)}</span>
                    <br />
                    <span className="t-secondary">
                      {doc.generatedAt.toISOString().slice(0, 10)}
                      {via.trackingNumber ? ` · tracking ${via.trackingNumber}` : ""}
                      {via.certified && !via.trackingNumber ? " · certified" : ""}
                    </span>
                  </span>
                  <a className="btn-quiet" href={documentUrl(doc.r2Key)}>
                    Open
                  </a>
                </li>
              );
            })}
          </ul>
        )}
        <div style={{ marginTop: 16 }}>
          <PacketForm lienCaseId={id} />
          <p className="field-help">
            One PDF for the sale file: the cover sheet with every computed date and citation, each
            notice exactly as it was mailed, then the ledger verbatim.
          </p>
        </div>
      </section>

      <section className="hairline-t" style={{ marginTop: 24, paddingTop: 20 }}>
        <h2 className="t-label">Rule pack notes</h2>
        <p className="t-secondary" style={{ marginTop: 8 }}>
          {found.rule.notes}
        </p>
      </section>

      {live ? (
        <section className="hairline-t" style={{ marginTop: 24, paddingTop: 20 }}>
          <h2 className="t-label">Close the case</h2>
          <p className="t-secondary" style={{ marginTop: 8, marginBottom: 12 }}>
            Paying the balance in full closes this automatically and lifts the overlock. Use this when
            something happened off-screen.
          </p>
          <ResolveForm lienCaseId={id} />
        </section>
      ) : (
        <p className="t-secondary" style={{ marginTop: 24 }}>
          Closed{found.lienCase.resolvedReason ? ` — ${found.lienCase.resolvedReason}` : ""}. The file
          stays readable and the packet still prints.
        </p>
      )}
    </main>
  );
}

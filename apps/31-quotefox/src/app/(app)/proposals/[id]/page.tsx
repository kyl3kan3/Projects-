import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ScreenHeader } from "@/components/ScreenHeader";
import { StatusPill } from "@/components/StatusPill";
import { HeroAmount } from "@/components/Money";
import {
  IconCard,
  IconCheck,
  IconClock,
  IconDownload,
  IconEye,
  IconSend,
  IconSignature,
} from "@/components/icons";
import { requireOnboardedUser } from "@/lib/auth";
import { longDate, proposalPill, proposalState, timeAgo } from "@/lib/display";
import { formatMoney } from "@/lib/money";
import { quantityLabel } from "@/lib/item-fields";
import { loadProposal, nudgesFor } from "@/lib/proposals";
import { nudgeSummary } from "@/lib/sweep";
import { featureEnabled, orgAsGatable } from "@/lib/plans";
import type { ProposalEventType } from "@/db/schema";
import { ProposalControls } from "./ProposalControls";

export const metadata: Metadata = { title: "Proposal" };
export const dynamic = "force-dynamic";

const EVENT_LABEL: Record<ProposalEventType, string> = {
  sent: "Proposal sent",
  delivered: "Email delivered",
  viewed: "Homeowner opened it",
  accepted: "Accepted",
  deposit_initiated: "Deposit checkout opened",
  deposit_paid: "Deposit paid",
  deposit_refunded: "Deposit refunded",
  nudge_sent: "Follow-up nudge sent",
  expired: "Expired",
  withdrawn: "Withdrawn",
};

function eventIcon(type: ProposalEventType) {
  switch (type) {
    case "viewed":
      return <IconEye size={18} />;
    case "accepted":
      return <IconSignature size={18} />;
    case "deposit_paid":
    case "deposit_initiated":
    case "deposit_refunded":
      return <IconCard size={18} />;
    case "nudge_sent":
      return <IconClock size={18} />;
    default:
      return <IconSend size={18} />;
  }
}

export default async function ProposalPage({ params }: { params: Promise<{ id: string }> }) {
  const { org } = await requireOnboardedUser();
  const { id } = await params;
  const bundle = await loadProposal(id);
  if (!bundle || bundle.org.id !== org.id) notFound();
  const nudges = await nudgesFor(id);
  const state = proposalState(bundle.proposal);
  const nudgesEnabled = featureEnabled(orgAsGatable(org), "nudges");

  return (
    <main>
      <ScreenHeader
        title={bundle.job.customerName}
        meta={`${bundle.job.title} · sent ${longDate(bundle.proposal.sentAt)}`}
        backHref="/proposals"
        backLabel="Proposals"
        showSettings={false}
      />

      <section className="gutter" style={{ paddingBottom: 20 }}>
        <p className="t-label">Proposal total</p>
        <HeroAmount cents={bundle.proposal.totalCents} />
        <div style={{ marginTop: 8 }}>
          <StatusPill pill={proposalPill(state)} />
        </div>
        <p className="t-secondary" style={{ marginTop: 8 }}>
          {bundle.proposal.depositCents > 0
            ? `${formatMoney(bundle.proposal.depositCents)} deposit${bundle.deposit?.status === "paid" ? " — paid" : " to start"}`
            : "No deposit on this proposal"}
          {state === "expired" ? " · the link has expired" : ""}
        </p>
      </section>

      <section className="gutter" style={{ paddingBottom: 24 }}>
        <p className="t-label" style={{ paddingBottom: 4 }}>
          Timeline
        </p>
        {bundle.events.map((event) => (
          <div key={event.id} className="row">
            <span
              style={{
                color:
                  event.type === "accepted" || event.type === "deposit_paid"
                    ? "var(--color-hi-vis)"
                    : "var(--color-text-3)",
                flex: "none",
              }}
            >
              {eventIcon(event.type)}
            </span>
            <span style={{ flex: 1 }}>
              <span className="t-title" style={{ display: "block" }}>
                {EVENT_LABEL[event.type]}
              </span>
              <span className="t-secondary" style={{ color: "var(--color-text-3)" }}>
                {timeAgo(event.occurredAt)}
                {event.type === "accepted" && bundle.proposal.acceptedByName
                  ? ` · signed ${bundle.proposal.acceptedByName}`
                  : ""}
                {event.type === "nudge_sent" && event.metadata
                  ? ` · day ${(event.metadata as { rung?: number }).rung ?? "?"}`
                  : ""}
              </span>
            </span>
          </div>
        ))}
        <p className="t-secondary" style={{ marginTop: 12, color: "var(--color-text-3)" }}>
          {nudgesEnabled
            ? nudgeSummary(nudges)
            : "Automatic follow-up nudges need the Crew plan. Nothing is sent on Solo."}
        </p>
      </section>

      {bundle.proposal.acceptedAt ? (
        <section className="gutter" style={{ paddingBottom: 24 }}>
          <div className="panel" style={{ padding: 16 }}>
            <p className="t-title" style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <IconCheck size={18} style={{ color: "var(--color-hi-vis)" }} />
              Acceptance record
            </p>
            <p className="t-secondary" style={{ marginTop: 6 }}>
              {bundle.proposal.acceptedByName} · {longDate(bundle.proposal.acceptedAt)}
              {bundle.proposal.acceptanceIp ? ` · from ${bundle.proposal.acceptanceIp}` : ""}
            </p>
            {bundle.proposal.pdfKey ? (
              <a
                className="btn btn-secondary btn-full"
                href={`/api/proposals/${bundle.proposal.id}/pdf`}
                style={{ marginTop: 12 }}
              >
                <IconDownload size={18} />
                Download the signed PDF
              </a>
            ) : null}
          </div>
        </section>
      ) : null}

      <section className="gutter" style={{ paddingBottom: 24 }}>
        <p className="t-label" style={{ paddingBottom: 4 }}>
          Scope as sent
        </p>
        {bundle.lines.map((line) => (
          <div key={line.id} className="row">
            <span style={{ flex: 1, minWidth: 0 }}>
              <span className="t-title" style={{ display: "block" }}>
                {line.name}
              </span>
              <span className="t-secondary" style={{ color: "var(--color-text-3)" }}>
                {quantityLabel(line.quantityMilli, line.unit)} × {formatMoney(line.unitPriceCents)}
              </span>
            </span>
            <span className="t-data" style={{ flex: "none" }}>
              {formatMoney(line.lineTotalCents)}
            </span>
          </div>
        ))}
      </section>

      <section className="gutter" style={{ paddingBottom: 24 }}>
        <ProposalControls
          proposalId={bundle.proposal.id}
          canWithdraw={state !== "deposit_paid" && state !== "withdrawn"}
        />
        <Link
          href={`/estimates/${bundle.estimate.id}`}
          className="btn-quiet"
          style={{ paddingLeft: 0, marginTop: 8 }}
        >
          See the estimate behind it
        </Link>
      </section>
    </main>
  );
}

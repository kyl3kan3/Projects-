import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ScreenHeader } from "@/components/ScreenHeader";
import { IconAlert } from "@/components/icons";
import { requireOnboardedUser } from "@/lib/auth";
import { computeDepositCents, depositWarning } from "@/lib/deposits";
import { getEstimate, walkthroughFor } from "@/lib/estimates";
import { featureEnabled, orgAsGatable, planRequiredFor } from "@/lib/plans";
import { EstimateEditor } from "./EstimateEditor";

export const metadata: Metadata = { title: "Estimate" };
export const dynamic = "force-dynamic";

export default async function EstimatePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ reveal?: string }>;
}) {
  const { org } = await requireOnboardedUser();
  const { id } = await params;
  const { reveal } = await searchParams;

  const found = await getEstimate(org.id, id);
  if (!found) notFound();
  const walkthrough = await walkthroughFor(found.estimate);

  const depositsEnabled = featureEnabled(orgAsGatable(org), "deposits");
  const depositCents = depositsEnabled
    ? computeDepositCents(
        found.estimate.totalCents,
        found.estimate.depositType,
        found.estimate.depositValue,
      )
    : 0;
  const warning = depositWarning(depositCents, found.estimate.totalCents, found.job.stateCode);

  return (
    <main>
      <ScreenHeader
        title={found.job.customerName}
        meta={`${found.job.title} · v${found.estimate.version}`}
        backHref={`/jobs/${found.job.id}`}
        backLabel="Job"
        showSettings={false}
      />

      {walkthrough?.transcriptSource === "demo_fixture" ? (
        <section className="gutter" style={{ paddingBottom: 20 }}>
          <div className="panel" style={{ padding: 16, display: "flex", gap: 12 }}>
            <IconAlert size={20} style={{ color: "var(--color-amber)", flex: "none" }} />
            <div>
              <p className="t-title">Drafted from a demo transcript</p>
              <p className="t-secondary" style={{ marginTop: 4 }}>
                No OPENAI_API_KEY is configured on this install, so the walkthrough audio was not
                transcribed. These lines came from your typed notes, your photo captions and a sample{" "}
                {found.job.trade} narration — every price is still your own, but check the scope before
                you send.
              </p>
            </div>
          </div>
        </section>
      ) : null}

      {found.estimate.status === "sent" ? (
        <section className="gutter" style={{ paddingBottom: 20 }}>
          <div className="panel" style={{ padding: 16 }}>
            <p className="t-title">This version has been sent</p>
            <p className="t-secondary" style={{ marginTop: 4 }}>
              The homeowner is looking at these numbers, so they are frozen. Start version{" "}
              {found.estimate.version + 1} to re-quote.
            </p>
            <Link href={`/jobs/${found.job.id}`} className="btn-quiet" style={{ paddingLeft: 0 }}>
              Back to the job
            </Link>
          </div>
        </section>
      ) : null}

      <EstimateEditor
        estimateId={found.estimate.id}
        jobId={found.job.id}
        locked={found.estimate.status === "sent"}
        reveal={reveal === "1"}
        lines={found.lines.map((line) => ({
          id: line.id,
          name: line.name,
          description: line.description,
          quantityMilli: line.quantityMilli,
          unit: line.unit,
          unitPriceCents: line.unitPriceCents,
          lineTotalCents: line.lineTotalCents,
          needsPricing: line.needsPricing,
          source: line.source,
          transcriptExcerpt: line.transcriptExcerpt,
          transcriptOffsetSeconds: line.transcriptOffsetSeconds,
        }))}
        subtotalCents={found.estimate.subtotalCents}
        taxCents={found.estimate.taxCents}
        totalCents={found.estimate.totalCents}
        taxRateBp={found.estimate.taxRateBp}
        depositType={found.estimate.depositType}
        depositValue={found.estimate.depositValue}
        depositCents={depositCents}
        depositWarning={warning?.message ?? null}
        depositsEnabled={depositsEnabled}
        depositUpgradeHint={
          depositsEnabled
            ? null
            : `Collecting a deposit on the proposal needs the ${planRequiredFor("deposits") === "crew" ? "Crew" : "Fleet"} plan. The proposal still sends and can still be accepted.`
        }
        customerEmail={found.job.customerEmail}
        customerName={found.job.customerName}
      />
    </main>
  );
}

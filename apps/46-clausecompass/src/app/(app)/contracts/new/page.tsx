import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { creditBalance } from "@/lib/billing";
import { formatCents, PLANS } from "@/lib/plans";
import { fixtureByKey, SAMPLE_FIXTURE_KEY } from "@/fixtures/contracts";
import { UploadForm } from "./UploadForm";
import { IconCompass } from "@/components/icons";

export const metadata: Metadata = { title: "New review" };

export default async function NewContractPage() {
  const { account } = await requireUser();
  const credits = await creditBalance(account.id);
  const sample = fixtureByKey(SAMPLE_FIXTURE_KEY);

  return (
    <main className="screen">
      <div className="pt-8">
        <span style={{ color: "var(--color-oxblood)" }}>
          <IconCompass size={28} />
        </span>
        <h1 className="t-display mt-4 mb-3">Know what you&rsquo;re signing.</h1>
        <p className="t-body mb-8" style={{ color: "var(--color-text-2)" }}>
          Every clause gets quoted, typed, and scored against your playbook. Nothing in the
          report exists without a quote from your document.
        </p>
      </div>

      <UploadForm
        credits={credits}
        perContractPrice={formatCents(PLANS.per_contract.perContractCents)}
        sampleKey={SAMPLE_FIXTURE_KEY}
        sampleName={sample?.title ?? "Sample contract"}
      />
    </main>
  );
}

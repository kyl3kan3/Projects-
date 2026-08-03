import type { Metadata } from "next";
import { ScreenHeader } from "@/components/ScreenHeader";
import { requireOnboardedUser } from "@/lib/auth";
import { orgAsGatable, priceBookCapacity } from "@/lib/plans";
import { itemCount, sampleImportCsv } from "@/lib/price-book";
import { ImportForm } from "./ImportForm";

export const metadata: Metadata = { title: "Import a rate sheet" };
export const dynamic = "force-dynamic";

export default async function ImportPage() {
  const { org } = await requireOnboardedUser();
  const total = await itemCount(org.id);
  const capacity = priceBookCapacity(orgAsGatable(org), total);

  return (
    <main>
      <ScreenHeader
        title="Import a rate sheet"
        meta={
          capacity.unlimited
            ? `${total} items · unlimited`
            : `${capacity.remaining} of ${capacity.limit} slots free`
        }
        backHref="/price-book"
        backLabel="Price book"
        showSettings={false}
      />
      <section className="gutter" style={{ paddingBottom: 20 }}>
        <p className="t-secondary" style={{ maxWidth: "44ch" }}>
          Any CSV with a name column and a cost column works — the header names do not have to match
          ours. An item you already have with the same name and category is updated rather than
          duplicated, so re-importing after a price rise is safe.
        </p>
        <p className="t-secondary" style={{ marginTop: 12, color: "var(--color-text-3)" }}>
          Every row that cannot be read is listed back to you with its line number. Nothing is skipped
          quietly.
        </p>
      </section>
      <div className="gutter">
        <ImportForm sample={sampleImportCsv()} />
      </div>
    </main>
  );
}

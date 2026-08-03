import type { Metadata } from "next";
import Link from "next/link";
import { ImportForm } from "@/app/(app)/clients/import/ImportForm";
import { Banner, ScreenHeader } from "@/components/ui";
import { requireStylist } from "@/lib/auth";
import { featureAllowed, type Billable } from "@/lib/plans";
import { activeServices } from "@/server/appointments";

export const metadata: Metadata = { title: "Import clients" };

export default async function ImportPage() {
  const { stylist } = await requireStylist();
  const services = await activeServices(stylist.id);
  const gate = featureAllowed(stylist as Billable, "csv_import");

  return (
    <>
      <ScreenHeader label="Clients" title="Bring your book over" />
      {!gate.ok && <Banner tone="amber">{gate.reason}</Banner>}
      <p className="t-secondary" style={{ margin: "8px 0 24px" }}>
        Export your client list from whatever you use now — Square, Booksy, your phone's
        contacts — and paste it here. A last-visit date per client is enough to know roughly
        when each of them is due back.
      </p>
      <ImportForm services={services.map((s) => ({ id: s.id, name: s.name }))} />
      <p style={{ marginTop: 24 }}>
        <Link className="btn-quiet" href="/clients">
          Back to clients
        </Link>
      </p>
    </>
  );
}

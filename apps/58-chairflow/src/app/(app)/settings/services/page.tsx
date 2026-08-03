import type { Metadata } from "next";
import Link from "next/link";
import {
  ArchiveServiceForm,
  ServiceForm,
  ServiceList,
  type ServiceRow,
} from "@/app/(app)/settings/SettingsForms";
import { EmptyState, ScreenHeader } from "@/components/ui";
import { requireStylist } from "@/lib/auth";
import { depositRuleLabel, parseDepositRule } from "@/lib/policy";
import { activeServices, serviceById } from "@/server/appointments";

export const metadata: Metadata = { title: "Services" };

export default async function ServicesPage({
  searchParams,
}: {
  searchParams: Promise<{ edit?: string }>;
}) {
  const { stylist } = await requireStylist();
  const params = await searchParams;
  const services = await activeServices(stylist.id);
  const editingRaw = params.edit ? await serviceById(params.edit) : null;
  const editing =
    editingRaw && editingRaw.stylistId === stylist.id ? editingRaw : null;

  const toRow = (s: NonNullable<typeof editingRaw>): ServiceRow => {
    const rule = parseDepositRule(s.depositRule);
    return {
      id: s.id,
      name: s.name,
      durationMinutes: s.durationMinutes,
      priceCents: s.priceCents,
      depositLabel: depositRuleLabel(rule, s.priceCents),
      depositKind: rule.kind,
      depositValue:
        rule.kind === "flat"
          ? (rule.cents / 100).toFixed(2)
          : rule.kind === "percent"
            ? String(rule.percent)
            : "",
    };
  };

  return (
    <>
      <ScreenHeader label="Settings" title={editing ? `Edit ${editing.name}` : "Services"} />

      {services.length === 0 ? (
        <EmptyState
          icon="policy-scroll"
          title="Nothing to book yet"
          body="Each service is a name, how long it takes, what it costs and whether it asks for a deposit. The deposit rule is where the protection starts."
        />
      ) : (
        <section style={{ paddingBottom: 24 }}>
          <ServiceList services={services.map(toRow)} />
          <div className="stack" style={{ gap: 8, paddingTop: 12 }}>
            {services.map((s) => (
              <div key={s.id} style={{ display: "flex", gap: 16, alignItems: "center" }}>
                <Link className="btn-quiet" href={`/settings/services?edit=${s.id}`}>
                  Edit {s.name}
                </Link>
                <ArchiveServiceForm id={s.id} name={s.name} />
              </div>
            ))}
          </div>
        </section>
      )}

      <section style={{ paddingBottom: 24 }}>
        <p className="t-label" style={{ margin: "0 0 12px" }}>
          {editing ? "Edit the service" : "Add a service"}
        </p>
        <ServiceForm key={editing?.id ?? "new"} editing={editing ? toRow(editing) : null} />
        {editing && (
          <p style={{ marginTop: 12 }}>
            <Link className="btn-quiet" href="/settings/services">
              Stop editing
            </Link>
          </p>
        )}
      </section>

      <p>
        <Link className="btn-quiet" href="/settings">
          Back to settings
        </Link>
      </p>
    </>
  );
}

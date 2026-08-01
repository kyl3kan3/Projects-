import type { Metadata } from "next";
import Link from "next/link";
import { requireLandlord } from "@/lib/auth";
import { landlordProperties, knownStates } from "@/lib/units";
import { countUnits } from "@/lib/ledger";
import { canAddUnit, plan, nextPlanUp, PLANS } from "@/lib/plans";
import { NewUnitForm } from "./NewUnitForm";

export const metadata: Metadata = { title: "Add a unit" };
export const dynamic = "force-dynamic";

export default async function NewUnitPage({ searchParams }: { searchParams: Promise<{ first?: string }> }) {
  const { landlord } = await requireLandlord();
  const { first } = await searchParams;
  const [properties, used] = await Promise.all([landlordProperties(landlord.id), countUnits(landlord.id)]);
  const gate = canAddUnit(landlord.plan, used);
  const up = nextPlanUp(landlord.plan);

  return (
    <main className="screen mx-auto max-w-[560px]">
      <header className="pt-8 pb-6">
        {first ? null : (
          <Link href="/units" className="btn-quiet no-underline">
            Units
          </Link>
        )}
        <h1 className="t-h2 mt-4">{first ? "Start with one unit." : "Add a unit"}</h1>
        <p className="t-secondary mt-2">
          {first
            ? "The address and rent are all it takes. From there you get a listing link, an application form, and a ledger waiting for the first charge."
            : `On ${plan(landlord.plan).name}: ${used} of ${plan(landlord.plan).units} units.`}
        </p>
      </header>

      {!gate.allowed ? (
        <div className="notice mb-6" data-tone="warn">
          <p className="t-title">Your plan is full.</p>
          <p className="t-secondary mt-2">{gate.reason}</p>
          {up ? (
            <Link href="/settings/billing" className="btn btn-primary btn-full mt-4">
              Move to {PLANS[up].name} — ${PLANS[up].priceMonthly}/mo
            </Link>
          ) : null}
        </div>
      ) : (
        <NewUnitForm
          properties={properties.map((p) => ({ id: p.property.id, label: `${p.property.address}, ${p.property.city}` }))}
          states={knownStates()}
        />
      )}
    </main>
  );
}

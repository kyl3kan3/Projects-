/**
 * /units/[id]/move-in — the ten-minute flow (DESIGN.md screen 3).
 *
 * Plain numbered steps, and the page shows the one the move-in is actually on
 * rather than a progress bar that lies. Step 1 is the only form the owner fills;
 * steps 2 and 3 happen on the tenant's phone, and step 4 is the owner's fallback for
 * cash at the counter.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  MoveInLinkPanel,
  TenantDetailsForm,
} from "@/app/(console)/units/[id]/move-in/MoveInForms";
import { CompleteMoveInForm } from "@/app/(console)/units/[id]/UnitForms";
import { requireOwner } from "@/lib/auth";
import { mintTenantToken, tenantLinkUrl } from "@/lib/links";
import { formatMoney, isoDateOf, prorateFirstMonth } from "@/lib/money";
import { readSettings } from "@/lib/settings";
import { documentUrl } from "@/lib/storage";
import { activeTenancyForUnit, ownedUnit } from "@/lib/units";

export const metadata: Metadata = { title: "Move-in" };

function Step({
  n,
  title,
  state,
  children,
}: {
  n: number;
  title: string;
  state: "done" | "current" | "waiting";
  children?: React.ReactNode;
}) {
  return (
    <section className="hairline-t" style={{ marginTop: 20, paddingTop: 20 }}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="t-title">
          <span className="t-mono" style={{ color: "var(--color-dim)" }}>
            {n}.
          </span>{" "}
          {title}
        </h2>
        <span
          className="placard"
          data-tone={state === "done" ? "paid" : state === "current" ? "overdue" : "dim"}
        >
          {state === "done" ? "Done" : state === "current" ? "Now" : "Waiting"}
        </span>
      </div>
      {children ? <div style={{ marginTop: 16 }}>{children}</div> : null}
    </section>
  );
}

export default async function MoveInPage({ params }: { params: Promise<{ id: string }> }) {
  const { owner } = await requireOwner();
  const { id } = await params;
  const found = await ownedUnit(owner.id, id);
  if (!found) notFound();

  const { unit, facility } = found;
  const asOf = isoDateOf(new Date());
  const settings = readSettings(owner.settings);
  const live = await activeTenancyForUnit(unit.id);

  if (!live) {
    return (
      <main style={{ padding: "20px 20px 40px", maxWidth: 620 }}>
        <Link href={`/units/${unit.id}`} className="t-secondary">
          ← Unit {unit.label}
        </Link>
        <h1 className="t-h2" style={{ marginTop: 8 }}>
          Move in to {unit.label}
        </h1>
        <p className="t-secondary" style={{ marginTop: 4 }}>
          {unit.size} · street rate {formatMoney(unit.monthlyRateCents)}/mo · {facility.name}
        </p>

        <Step n={1} title="Tenant and rate" state="current">
          <TenantDetailsForm
            unitId={unit.id}
            streetRateCents={unit.monthlyRateCents}
            today={asOf}
          />
        </Step>
        <Step n={2} title="Lease read and signed on the tenant's phone" state="waiting" />
        <Step n={3} title="Card or ACH on file" state="waiting" />
        <Step n={4} title="Prorated first payment, then the gate code" state="waiting" />
      </main>
    );
  }

  const { tenancy, tenant } = live;
  const firstCents = prorateFirstMonth(tenancy.rateCents, tenancy.startedOn, settings.prorateRule);
  const token = await mintTenantToken(tenancy.id, tenancy.signedAt ? "pay" : "movein");
  const complete = Boolean(tenancy.gateCode);

  return (
    <main style={{ padding: "20px 20px 40px", maxWidth: 620 }}>
      <Link href={`/units/${unit.id}`} className="t-secondary">
        ← Unit {unit.label}
      </Link>
      <h1 className="t-h2" style={{ marginTop: 8 }}>
        Move in to {unit.label}
      </h1>
      <p className="t-secondary" style={{ marginTop: 4 }}>
        {tenant.name} · {formatMoney(tenancy.rateCents)}/mo from {tenancy.startedOn} · first payment{" "}
        {formatMoney(firstCents)}
        {settings.prorateRule === "daily" ? " (prorated)" : ""}
      </p>

      <Step n={1} title="Tenant and rate" state="done">
        <p className="t-secondary">
          {tenant.name} · {tenant.phone || "no mobile"} · notice address {tenant.address}
        </p>
        {tenancy.leaseR2Key ? (
          <p style={{ marginTop: 8 }}>
            <a className="btn-quiet" href={documentUrl(tenancy.leaseR2Key)}>
              Read the rendered lease
            </a>
          </p>
        ) : null}
      </Step>

      <Step
        n={2}
        title="Lease read and signed on the tenant's phone"
        state={tenancy.signedAt ? "done" : "current"}
      >
        {tenancy.signedAt ? (
          <p className="t-mono" style={{ color: "var(--color-moss-strong)" }}>
            Signed {tenancy.signedAt.toISOString().slice(0, 19).replace("T", " ")}Z · sha256{" "}
            {tenancy.leaseHash?.slice(0, 24)}…
          </p>
        ) : (
          <MoveInLinkPanel tenancyId={tenancy.id} initialUrl={tenantLinkUrl(token)} />
        )}
      </Step>

      <Step
        n={3}
        title="Card or ACH on file"
        state={
          tenancy.stripePaymentMethodId ? "done" : tenancy.signedAt ? "current" : "waiting"
        }
      >
        {tenancy.stripePaymentMethodId ? (
          <p className="t-mono">{tenancy.stripePaymentMethodId}</p>
        ) : tenancy.signedAt ? (
          <MoveInLinkPanel tenancyId={tenancy.id} initialUrl={tenantLinkUrl(token)} />
        ) : (
          <p className="t-secondary">
            The tenant adds a method on the same link, right after signing.
          </p>
        )}
      </Step>

      <Step
        n={4}
        title="Prorated first payment, then the gate code"
        state={complete ? "done" : tenancy.signedAt ? "current" : "waiting"}
      >
        {complete ? (
          <>
            <p className="t-stat">{tenancy.gateCode}</p>
            <p className="t-secondary" style={{ marginTop: 4 }}>
              Issued and active. Unit {unit.label} is occupied.
            </p>
            <Link
              className="btn btn-secondary"
              style={{ marginTop: 16 }}
              href={`/map?facility=${facility.id}&flipped=${unit.id}`}
            >
              Back to the yard
            </Link>
          </>
        ) : tenancy.signedAt ? (
          <CompleteMoveInForm
            tenancyId={tenancy.id}
            amountCents={firstCents}
            hasMethod={Boolean(tenancy.stripePaymentMethodId)}
          />
        ) : (
          <p className="t-secondary">
            The gate code is the last thing issued, and only after the money lands.
          </p>
        )}
      </Step>
    </main>
  );
}

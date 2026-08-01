import type { Metadata } from "next";
import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { products, variants } from "@/db/schema";
import { requireShop } from "@/lib/auth";
import { trialActive } from "@/lib/billing";
import { moneyExact } from "@/lib/format";
import { entitlementsFor } from "@/lib/plans";
import { SUPPLIER_CSV_TEMPLATE } from "@/lib/supplier-csv";
import { displayTitle, supplierList } from "@/lib/views";
import { AddSupplierToggle, AssignForm, ImportForm, SupplierForm } from "./SupplierForms";

export const metadata: Metadata = { title: "Suppliers" };
export const dynamic = "force-dynamic";

/**
 * Suppliers, lead times, and the per-SKU assignment that makes a reorder point real
 * rather than a guess against a default.
 *
 * The unassigned SKUs are listed first, because that is the data gap that most
 * degrades the forecast — the README's third risk, "data quality in, garbage out".
 */
export default async function SuppliersPage() {
  const { shop } = await requireShop();
  const entitlements = entitlementsFor(shop.plan, trialActive(shop));
  const rows = await supplierList(shop.id);

  const db = getDb();
  const skuRows = await db
    .select({
      id: variants.id,
      sku: variants.sku,
      title: variants.title,
      productTitle: products.title,
      supplierId: variants.supplierId,
      moq: variants.moq,
      packSize: variants.packSize,
      costCents: variants.costCents,
      tracked: variants.tracked,
    })
    .from(variants)
    .innerJoin(products, eq(products.id, variants.productId))
    .where(eq(variants.shopId, shop.id))
    .orderBy(asc(variants.sku));

  const supplierOptions = rows.map((row) => ({
    id: row.supplier.id,
    name: row.supplier.name,
    leadTimeDays: row.supplier.leadTimeDays,
  }));
  const unassigned = skuRows.filter((row) => row.supplierId === null);
  const assigned = skuRows.filter((row) => row.supplierId !== null);

  if (!entitlements.suppliers) {
    return (
      <main className="screen">
        <header className="pt-8 pb-6">
          <h1 className="t-h2">Suppliers</h1>
        </header>
        <section className="panel p-5">
          <p className="t-title">Supplier profiles are part of Backroom.</p>
          <p className="t-secondary mt-2">
            On {shop.plan === "counter" ? "Counter" : "your plan"} every SKU uses the store&rsquo;s
            default lead time. Backroom lets you set a real lead time per supplier, which is what
            turns a reorder point into a date.
          </p>
          <Link href="/settings/billing" className="btn btn-primary btn-full mt-4">
            See plans
          </Link>
        </section>
      </main>
    );
  }

  return (
    <main className="screen">
      <header className="pt-8 pb-6">
        <h1 className="t-h2">Suppliers</h1>
        <p className="t-data mt-2" style={{ color: "var(--color-fg-2)" }}>
          {rows.length} SUPPLIER{rows.length === 1 ? "" : "S"} ·{" "}
          {unassigned.length} SKU{unassigned.length === 1 ? "" : "S"} UNASSIGNED
        </p>
      </header>

      <section className="mb-8">
        {rows.length === 0 ? (
          <div className="panel p-5">
            <p className="t-title">No suppliers yet.</p>
            <p className="t-secondary mt-2">
              A lead time is the single biggest lever on a reorder date: a 34-day sea-freight
              supplier and a 7-day local workshop need completely different order-by dates for the
              same velocity. Add them here, or import the spreadsheet you already keep.
            </p>
          </div>
        ) : (
          rows.map(({ supplier, skuCount }) => (
            <article key={supplier.id} className="hairline-b py-4">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="t-title truncate">{supplier.name}</p>
                  <p className="t-data mt-1" style={{ color: "var(--color-fg-2)" }}>
                    {supplier.leadTimeDays}D LEAD · {skuCount} SKU{skuCount === 1 ? "" : "S"}
                    {supplier.minOrderValueCents > 0
                      ? ` · MIN ${moneyExact(supplier.minOrderValueCents, shop.currency)}`
                      : ""}
                  </p>
                  <p className="t-data mt-1" style={{ color: "var(--color-fg-3)" }}>
                    {supplier.email ?? "NO EMAIL — CSV EXPORT ONLY"}
                  </p>
                  {supplier.notes ? (
                    <p className="t-secondary mt-2">{supplier.notes}</p>
                  ) : null}
                </div>
              </div>
              <SupplierForm
                supplier={{
                  id: supplier.id,
                  name: supplier.name,
                  email: supplier.email,
                  leadTimeDays: supplier.leadTimeDays,
                  minOrderValueCents: supplier.minOrderValueCents,
                  notes: supplier.notes,
                  skuCount,
                }}
              />
            </article>
          ))
        )}
        <div className="mt-4">
          <AddSupplierToggle />
        </div>
      </section>

      <section className="mb-8">
        <h2 className="t-label mb-1">Import lead times and costs</h2>
        <p className="t-secondary mb-3">
          Any column order, and these headers: SKU, Supplier, Supplier email, Lead time days, Unit
          cost, MOQ, Pack size, Min order value. Rows whose SKU is not in your catalogue are
          reported by line number rather than skipped quietly.
        </p>
        <ImportForm template={SUPPLIER_CSV_TEMPLATE} />
      </section>

      {unassigned.length ? (
        <section className="mb-8">
          <h2 className="t-label mb-1">Unassigned SKUs · {unassigned.length}</h2>
          <p className="t-secondary mb-3">
            These use the store default lead time, so their order-by dates are the least
            trustworthy numbers in the app.
          </p>
          {unassigned.map((row) => (
            <div key={row.id} className="hairline-b py-3">
              <p className="t-title" style={{ fontSize: 15 }}>
                {displayTitle(row.productTitle, row.title)}
              </p>
              <p className="t-data mt-1" style={{ color: "var(--color-fg-3)" }}>
                {row.sku}
                {row.costCents === null ? " · NO UNIT COST" : ""}
              </p>
              <AssignForm
                variantId={row.id}
                sku={row.sku}
                suppliers={supplierOptions}
                currentSupplierId={row.supplierId}
                moq={row.moq}
                packSize={row.packSize}
              />
            </div>
          ))}
        </section>
      ) : null}

      {assigned.length ? (
        <section>
          <h2 className="t-label mb-3">Assigned SKUs · {assigned.length}</h2>
          {assigned.map((row) => (
            <div key={row.id} className="hairline-b py-3">
              <p className="t-title" style={{ fontSize: 15 }}>
                {displayTitle(row.productTitle, row.title)}
              </p>
              <p className="t-data mt-1" style={{ color: "var(--color-fg-3)" }}>
                {row.sku} · MOQ {row.moq} · PACK {row.packSize}
                {row.costCents !== null
                  ? ` · ${moneyExact(row.costCents, shop.currency)} COST`
                  : " · NO UNIT COST"}
              </p>
              <AssignForm
                variantId={row.id}
                sku={row.sku}
                suppliers={supplierOptions}
                currentSupplierId={row.supplierId}
                moq={row.moq}
                packSize={row.packSize}
              />
            </div>
          ))}
        </section>
      ) : null}
    </main>
  );
}

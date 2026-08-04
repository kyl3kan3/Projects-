import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CustomerForm } from "../CustomerForm";
import { updateCustomerAction } from "../actions";
import { OrderPlacard, Placard } from "@/components/Placard";
import { requireSession } from "@/lib/auth";
import { damageHistory, getCustomer } from "@/lib/customers";
import { formatDate, formatWindow } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { listOrders, todayFor } from "@/lib/orders";

export const metadata: Metadata = { title: "Customer" };

export default async function CustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { account } = await requireSession();
  const customer = await getCustomer(account.id, id);
  if (!customer) notFound();

  const today = todayFor(account);
  const [orders, damage] = await Promise.all([
    listOrders(account.id, { customerId: customer.id }),
    damageHistory(account.id, customer.id),
  ]);

  const lifetimeCents = orders
    .filter((o) => o.order.status !== "cancelled" && o.order.status !== "draft")
    .reduce((sum, o) => sum + o.order.totalCents, 0);
  const chargedDamage = damage
    .filter((d) => d.status === "charged")
    .reduce((sum, d) => sum + d.amountCents, 0);

  return (
    <main style={{ paddingBottom: 40, maxWidth: 560 }}>
      <Link href="/customers" className="btn-quiet">
        Customers
      </Link>

      <div className="between" style={{ marginTop: 12 }}>
        <div style={{ minWidth: 0 }}>
          <h1 className="t-h2">{customer.name}</h1>
          <p className="t-secondary" style={{ marginTop: 4 }}>
            {customer.company ?? "No company"} · {customer.email ?? "no email"} ·{" "}
            {customer.phone ?? "no phone"}
          </p>
        </div>
        {customer.taxExempt ? <Placard label="Tax exempt" tone="dim" /> : null}
      </div>

      <div
        className="panel"
        style={{
          marginTop: 20,
          padding: 16,
          display: "grid",
          gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
          gap: 16,
        }}
      >
        <div>
          <p className="t-label">Orders</p>
          <p className="t-count" style={{ marginTop: 4 }}>
            {orders.length}
          </p>
        </div>
        <div>
          <p className="t-label">Lifetime</p>
          <p className="t-mono-lg" style={{ marginTop: 12 }}>
            {formatMoney(lifetimeCents)}
          </p>
        </div>
      </div>

      <section style={{ marginTop: 32 }}>
        <h2 className="t-label">Order history</h2>
        {orders.length === 0 ? (
          <p className="t-secondary" style={{ marginTop: 8 }}>
            Nothing rented yet.
          </p>
        ) : (
          <div className="stack" style={{ marginTop: 8 }}>
            {orders.map((row) => (
              <Link key={row.order.id} href={`/orders/${row.order.id}`} className="row">
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p className="t-title">#{row.order.number}</p>
                  <p className="t-mono tone-dim" style={{ marginTop: 2 }}>
                    {formatWindow(row.order.outOn, row.order.dueBackOn)}
                  </p>
                </div>
                <div style={{ textAlign: "right", flex: "none" }}>
                  <span className="t-mono">{formatMoney(row.order.totalCents)}</span>
                  <div style={{ marginTop: 2 }}>
                    <OrderPlacard order={row.order} today={today} />
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      <section style={{ marginTop: 32 }}>
        <div className="between">
          <h2 className="t-label">Damage history</h2>
          {chargedDamage > 0 ? (
            <span className="t-mono tone-warn">{formatMoney(chargedDamage)} charged</span>
          ) : null}
        </div>
        {damage.length === 0 ? (
          <p className="t-secondary" style={{ marginTop: 8 }}>
            Nothing has ever come back damaged. Worth knowing.
          </p>
        ) : (
          <div className="stack" style={{ marginTop: 8 }}>
            {damage.map((claim) => (
              <div key={claim.id} className="row row-stack">
                <div className="between" style={{ width: "100%" }}>
                  <span className="t-title">{claim.itemName}</span>
                  <span className="t-mono tone-warn">{formatMoney(claim.amountCents)}</span>
                </div>
                <p className="t-secondary" style={{ width: "100%" }}>
                  {claim.description}
                </p>
                <div className="between" style={{ width: "100%" }}>
                  <Link href={`/orders/${claim.orderId}`} className="btn-quiet">
                    Order #{claim.orderNumber}
                  </Link>
                  <span className="t-mono tone-dim">
                    {formatDate(claim.outOn, { year: true })} · {claim.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section style={{ marginTop: 32 }}>
        <h2 className="t-label">Details</h2>
        <div style={{ marginTop: 12 }}>
          <CustomerForm customer={customer} action={updateCustomerAction} />
        </div>
      </section>
    </main>
  );
}

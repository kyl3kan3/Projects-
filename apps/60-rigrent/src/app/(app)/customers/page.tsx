import type { Metadata } from "next";
import Link from "next/link";
import { CustomerForm } from "./CustomerForm";
import { createCustomerAction } from "./actions";
import { Placard } from "@/components/Placard";
import { requireSession } from "@/lib/auth";
import { listCustomers } from "@/lib/customers";
import { formatDate } from "@/lib/dates";

export const metadata: Metadata = { title: "Customers" };

export default async function CustomersPage() {
  const { account } = await requireSession();
  const customers = await listCustomers(account.id);

  return (
    <main style={{ paddingBottom: 40, maxWidth: 560 }}>
      <h1 className="t-h2">Customers</h1>
      <p className="t-secondary" style={{ marginTop: 4 }}>
        Contact, tax status, and the two histories worth checking before you say yes.
      </p>

      {customers.length === 0 ? (
        <p className="t-secondary" style={{ marginTop: 20 }}>
          No customers yet. The first one gets added when you build a quote, or add them here.
        </p>
      ) : (
        <div className="stack" style={{ marginTop: 20 }}>
          {customers.map((customer) => (
            <Link key={customer.id} href={`/customers/${customer.id}`} className="row">
              <div style={{ flex: 1, minWidth: 0 }}>
                <p className="t-title">{customer.name}</p>
                <p className="t-secondary" style={{ marginTop: 2 }}>
                  {customer.company ?? customer.email ?? customer.phone ?? "No contact on file"}
                </p>
              </div>
              <div style={{ textAlign: "right", flex: "none" }}>
                <p className="t-mono tone-dim">
                  {customer.orderCount} order{customer.orderCount === 1 ? "" : "s"}
                </p>
                {customer.lastOutOn ? (
                  <p className="t-mono tone-dim">last {formatDate(customer.lastOutOn)}</p>
                ) : null}
                {customer.taxExempt ? <Placard label="Tax exempt" tone="dim" mark={false} /> : null}
              </div>
            </Link>
          ))}
        </div>
      )}

      <section style={{ marginTop: 32 }}>
        <h2 className="t-label">Add a customer</h2>
        <div style={{ marginTop: 12 }}>
          <CustomerForm customer={null} action={createCustomerAction} />
        </div>
      </section>
    </main>
  );
}

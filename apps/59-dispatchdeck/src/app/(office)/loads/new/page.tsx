import type { Metadata } from "next";
import Link from "next/link";
import { and, asc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { brokers, trucks, users } from "@/db/schema";
import { requireOffice } from "@/lib/auth";
import { parseAddress } from "@/lib/format";
import { NewLoadForm } from "./NewLoadForm";

export const metadata: Metadata = { title: "New load" };

export default async function NewLoadPage() {
  const { carrier } = await requireOffice();
  const db = getDb();

  const [brokerRows, truckRows, driverRows] = await Promise.all([
    db.select().from(brokers).where(eq(brokers.carrierId, carrier.id)).orderBy(asc(brokers.name)),
    db
      .select()
      .from(trucks)
      .where(and(eq(trucks.carrierId, carrier.id), eq(trucks.status, "active")))
      .orderBy(asc(trucks.unitNumber)),
    db
      .select()
      .from(users)
      .where(and(eq(users.carrierId, carrier.id), inArray(users.role, ["driver", "owner"])))
      .orderBy(asc(users.name)),
  ]);

  return (
    <main className="screen">
      <Link href="/loads" className="t-placard" style={{ textDecoration: "none" }}>
        ← Loads
      </Link>
      <h1 className="t-h2 mt-4 mb-2">New load</h1>
      <p className="t-secondary mb-8">
        Faster route: forward the rate con to{" "}
        <span className="t-mono" style={{ color: "var(--fg)" }}>
          {parseAddress(carrier.slug)}
        </span>{" "}
        and confirm the draft. This screen is for the loads that arrive by phone.
      </p>

      <NewLoadForm
        brokers={brokerRows.map((b) => ({
          id: b.id,
          label: b.mcNumber ? `${b.name} — MC ${b.mcNumber}` : b.name,
        }))}
        trucks={truckRows.map((t) => ({
          id: t.id,
          label: t.yearMakeModel ? `${t.unitNumber} — ${t.yearMakeModel}` : t.unitNumber,
        }))}
        drivers={driverRows.map((d) => ({ id: d.id, label: `${d.name} (${d.role})` }))}
      />
    </main>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { and, eq, inArray } from "drizzle-orm";
import { NewRunForm } from "./RunForms";
import { createRunAction } from "./actions";
import { Placard } from "@/components/Placard";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { requireSession } from "@/lib/auth";
import { addDays, formatDateWithDow } from "@/lib/dates";
import { todayFor } from "@/lib/orders";
import { canUseRuns, entitlements } from "@/lib/plans";
import { listRuns } from "@/lib/runs";

export const metadata: Metadata = { title: "Runs" };

export default async function RunsPage() {
  const { account } = await requireSession();
  const today = todayFor(account);
  const ent = entitlements(account);
  const gate = canUseRuns(ent);

  const [runs, staff] = await Promise.all([
    listRuns(account.id, { from: addDays(today, -14), to: addDays(today, 60) }),
    getDb()
      .select({ id: users.id, name: users.name, role: users.role })
      .from(users)
      .where(and(eq(users.accountId, account.id), inArray(users.role, ["driver", "staff", "owner"]))),
  ]);

  const upcoming = runs.filter((r) => r.run.runOn >= today);
  const past = runs.filter((r) => r.run.runOn < today);

  return (
    <main style={{ paddingBottom: 40 }}>
      <h1 className="t-h2">Runs</h1>
      <p className="t-secondary" style={{ marginTop: 4 }}>
        Orders grouped into a dated run, in stop order, with one load list for the truck. Three orders
        wanting 40 chairs is one line reading 120.
      </p>

      {!gate.allowed ? (
        <div className="banner" data-tone="accent" style={{ marginTop: 16 }}>
          {gate.reason}
        </div>
      ) : null}

      {upcoming.length === 0 ? (
        <div className="panel" style={{ marginTop: 20, padding: 20 }}>
          <p className="t-title">No runs planned.</p>
          <p className="t-secondary" style={{ marginTop: 8 }}>
            Plan one for the day the gear goes out and add the orders to it. The load list aggregates
            per item, so the warehouse counts once.
          </p>
        </div>
      ) : (
        <div className="stack" style={{ marginTop: 20 }}>
          {upcoming.map(({ run, stopCount, driverName }) => (
            <Link key={run.id} href={`/runs/${run.id}`} className="row">
              <div style={{ flex: 1, minWidth: 0 }}>
                <p className="t-title">
                  {run.kind === "delivery" ? "Delivery" : "Pickup"} ·{" "}
                  {formatDateWithDow(run.runOn)}
                </p>
                <p className="t-secondary" style={{ marginTop: 2 }}>
                  {run.truckLabel ?? "Truck unassigned"} · {driverName ?? "Driver unassigned"} ·{" "}
                  {stopCount} stop{stopCount === 1 ? "" : "s"}
                </p>
              </div>
              <Placard
                label={run.status}
                tone={run.status === "done" ? "good" : run.status === "planned" ? "dim" : "accent"}
              />
            </Link>
          ))}
        </div>
      )}

      <section style={{ marginTop: 32 }}>
        <h2 className="t-label">Plan a run</h2>
        <div style={{ marginTop: 12 }}>
          <NewRunForm
            action={createRunAction}
            drivers={staff}
            defaultRunOn={addDays(today, 1)}
            disabled={!gate.allowed}
            disabledReason={gate.reason}
          />
        </div>
      </section>

      {past.length > 0 ? (
        <section style={{ marginTop: 32 }}>
          <h2 className="t-label">Recent</h2>
          <div className="stack" style={{ marginTop: 8 }}>
            {past.slice(0, 10).map(({ run, stopCount }) => (
              <Link key={run.id} href={`/runs/${run.id}`} className="row">
                <span className="t-secondary" style={{ flex: 1 }}>
                  {run.kind} · {formatDateWithDow(run.runOn)} · {stopCount} stops
                </span>
                <Placard label={run.status} tone={run.status === "done" ? "good" : "dim"} />
              </Link>
            ))}
          </div>
        </section>
      ) : null}
    </main>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ItemForm } from "../ItemForm";
import { HoldForms, UnitForms } from "./ItemPanels";
import {
  addHoldAction,
  addUnitAction,
  createItemAction,
  removeHoldAction,
  retireItemAction,
  setUnitStatusAction,
  updateItemAction,
} from "../actions";
import { ActionForm } from "@/components/ActionForm";
import { ChalkGauge, LoadStrip } from "@/components/ChalkGauge";
import { requireSession } from "@/lib/auth";
import { availabilityMap, bookingsInRange } from "@/lib/availability";
import { dailyCommitted } from "@/lib/availability-core";
import { addDays, formatDate } from "@/lib/dates";
import { damageFeesOf, getItem, listHolds, listUnits } from "@/lib/items";
import { formatMoney } from "@/lib/money";
import { todayFor } from "@/lib/orders";
import { canUseMaintenanceHolds, canUseSerials, entitlements } from "@/lib/plans";
import { parseSettings } from "@/lib/settings";

export const metadata: Metadata = { title: "Item" };

export default async function ItemPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { account } = await requireSession();
  const item = await getItem(account.id, id);
  if (!item) notFound();

  const ent = entitlements(account);
  const today = todayFor(account);
  const horizon = addDays(today, 30);
  const settings = parseSettings(account.settings);

  const [bookings, units, holds, availability] = await Promise.all([
    bookingsInRange(account.id, today, horizon),
    item.trackedBy === "serial" ? listUnits(item.id) : Promise.resolve([]),
    listHolds(item.id),
    availabilityMap(account.id, today, addDays(today, 1)),
  ]);

  const perDay = dailyCommitted(
    bookings.filter((b) => b.itemId === item.id),
    today,
    horizon,
    addDays,
  );
  const facts = availability.get(item.id) ?? {
    itemId: item.id,
    itemName: item.name,
    ownedCount: item.ownedCount,
    bookedCount: 0,
    heldCount: 0,
  };

  const serialGate = canUseSerials(ent);
  const holdGate = canUseMaintenanceHolds(ent);

  return (
    <main style={{ paddingBottom: 40, maxWidth: 560 }}>
      <Link href="/items" className="btn-quiet">
        Gear
      </Link>

      <div className="between" style={{ marginTop: 12 }}>
        <div style={{ minWidth: 0 }}>
          <h1 className="t-h2">{item.name}</h1>
          <p className="t-secondary" style={{ marginTop: 4 }}>
            {item.category ?? "Uncategorised"} · {item.status === "retired" ? "Retired" : "Active"}
          </p>
        </div>
        <div style={{ textAlign: "right", flex: "none" }}>
          <p className="t-count">{item.ownedCount}</p>
          <p className="t-label">owned</p>
        </div>
      </div>

      <section className="panel" style={{ marginTop: 20, padding: 16 }}>
        <p className="t-label">Free today</p>
        <div style={{ marginTop: 8 }}>
          <ChalkGauge facts={facts} />
        </div>
        <p className="t-secondary" style={{ marginTop: 8 }}>
          {facts.ownedCount - facts.bookedCount - facts.heldCount} of {facts.ownedCount} free right
          now
          {facts.heldCount > 0 ? ` (${facts.heldCount} on a maintenance hold)` : ""}.
        </p>
        <div style={{ marginTop: 16 }}>
          <p className="t-label">Next 30 days</p>
          <div className="between" style={{ marginTop: 8 }}>
            <LoadStrip perDay={perDay} owned={item.ownedCount} />
            <span className="t-mono tone-dim">
              {formatDate(today)} → {formatDate(horizon)}
            </span>
          </div>
        </div>
      </section>

      <section style={{ marginTop: 32 }}>
        <h2 className="t-label">Details and fee schedule</h2>
        <div style={{ marginTop: 12 }}>
          <ItemForm
            item={item}
            fees={damageFeesOf(item)}
            defaultFees={settings.damageFeeDefaults}
            createAction={createItemAction}
            updateAction={updateItemAction}
          />
        </div>
      </section>

      <section style={{ marginTop: 32 }}>
        <h2 className="t-label">Maintenance holds</h2>
        <p className="t-secondary" style={{ marginTop: 4 }}>
          A hold takes units out of availability for a window — a torn sidewall in for a repair is as
          unavailable as one on a truck.
        </p>
        {holds.length > 0 ? (
          <div className="stack" style={{ marginTop: 12 }}>
            {holds.map((hold) => (
              <div key={hold.id} className="row">
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p className="t-mono">
                    {hold.quantity} units · {formatDate(hold.startsOn)} → {formatDate(hold.endsOn)}
                  </p>
                  <p className="t-secondary" style={{ marginTop: 2 }}>
                    {hold.reason ?? "No reason recorded"}
                  </p>
                </div>
                <HoldForms
                  holdId={hold.id}
                  itemId={item.id}
                  removeAction={removeHoldAction}
                  disabled={!holdGate.allowed}
                />
              </div>
            ))}
          </div>
        ) : (
          <p className="t-secondary" style={{ marginTop: 8 }}>
            No holds on this item.
          </p>
        )}
        <div style={{ marginTop: 16 }}>
          <HoldForms
            itemId={item.id}
            addAction={addHoldAction}
            disabled={!holdGate.allowed}
            disabledReason={holdGate.reason}
            ownedCount={item.ownedCount}
            today={today}
          />
        </div>
      </section>

      {item.trackedBy === "serial" ? (
        <section style={{ marginTop: 32 }}>
          <h2 className="t-label">Serials</h2>
          <UnitForms
            itemId={item.id}
            units={units}
            addAction={addUnitAction}
            statusAction={setUnitStatusAction}
            disabled={!serialGate.allowed}
            disabledReason={serialGate.reason}
          />
        </section>
      ) : null}

      <section style={{ marginTop: 32 }}>
        <h2 className="t-label">{item.status === "retired" ? "Bring it back" : "Retire it"}</h2>
        <p className="t-secondary" style={{ marginTop: 4, marginBottom: 12 }}>
          {item.status === "retired"
            ? "Reactivating puts it back in the catalogue and back into availability."
            : "Retiring hides it from new quotes. Its old orders keep reading correctly, and nothing is deleted."}
        </p>
        <ActionForm
          action={retireItemAction}
          submitLabel={item.status === "retired" ? "Reactivate" : "Retire this item"}
          variant={item.status === "retired" ? "secondary" : "danger"}
          hold={item.status !== "retired"}
          full={false}
          showMessage
        >
          <input type="hidden" name="itemId" value={item.id} />
          {item.status === "retired" ? (
            <input type="hidden" name="reactivate" value="1" />
          ) : null}
        </ActionForm>
      </section>

      <p className="t-secondary" style={{ marginTop: 32 }}>
        Replacement cost{" "}
        {item.replacementCents ? formatMoney(item.replacementCents) : "not set"} · daily{" "}
        {formatMoney(item.dailyRateCents)}
        {item.weekendRateCents ? ` · weekend ${formatMoney(item.weekendRateCents)}` : ""}
      </p>
    </main>
  );
}

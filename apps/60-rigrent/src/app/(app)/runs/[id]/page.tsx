/**
 * /runs/[id] — the run sheet (DESIGN.md screen 6).
 *
 * Load list first, in display type, because the sheet is read at the warehouse
 * door before it is read on the road. Then the stops in sequence, then the driver
 * check-off rows with camera buttons — 56px, for gloves.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq, inArray } from "drizzle-orm";
import { AddStopForm, AssignRunForm } from "../RunForms";
import {
  addStopAction,
  moveStopAction,
  removeStopAction,
  renderRunSheetAction,
  setRunDriverAction,
  setRunStatusAction,
} from "../actions";
import { ActionForm } from "@/components/ActionForm";
import { CheckInRow } from "@/components/CheckInRow";
import { Placard } from "@/components/Placard";
import { IconDocument } from "@/components/icons";
import { recordCheckAction } from "../../returns/actions";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { requireSession } from "@/lib/auth";
import { checksFor } from "@/lib/checkin";
import { photosFor } from "@/lib/claims";
import { formatDateWithDow } from "@/lib/dates";
import { getLines } from "@/lib/orders";
import { canUseRuns, entitlements } from "@/lib/plans";
import { candidateOrders, getRun } from "@/lib/runs";
import { fileUrl } from "@/lib/storage";

export const metadata: Metadata = { title: "Run sheet" };

export default async function RunPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { account } = await requireSession();
  const detail = await getRun(account.id, id);
  if (!detail) notFound();

  const { run, driverName, stops, loadList, totals } = detail;
  const ent = entitlements(account);
  const gate = canUseRuns(ent);

  const [staff, candidates] = await Promise.all([
    getDb()
      .select({ id: users.id, name: users.name, role: users.role })
      .from(users)
      .where(and(eq(users.accountId, account.id), inArray(users.role, ["driver", "staff", "owner"]))),
    candidateOrders(account.id, run.kind, run.runOn),
  ]);

  // Driver check-off is the out-direction check on a delivery run and the
  // in-direction check on a pickup run — the same control, both ends.
  const direction = run.kind === "delivery" ? "out" : "in";
  const checkoff = await Promise.all(
    stops.map(async (stop) => {
      const lines = await getLines(stop.orderId);
      const existing = await checksFor(stop.orderId, direction);
      const byLine = new Map(existing.map((c) => [c.orderLineId, c]));
      const photoCounts = new Map<string, number>();
      for (const check of existing) {
        photoCounts.set(check.orderLineId, (await photosFor(check.id)).length);
      }
      return { stop, lines, byLine, photoCounts };
    }),
  );

  const checked = checkoff.reduce(
    (sum, entry) => sum + entry.lines.filter((l) => entry.byLine.has(l.id)).length,
    0,
  );
  const totalLines = checkoff.reduce((sum, entry) => sum + entry.lines.length, 0);

  return (
    <main style={{ paddingBottom: 40 }}>
      <Link href="/runs" className="btn-quiet">
        Runs
      </Link>

      <div className="between" style={{ marginTop: 12 }}>
        <div style={{ minWidth: 0 }}>
          <h1 className="t-h2">
            {run.kind === "delivery" ? "Delivery run" : "Pickup run"}
          </h1>
          <p className="t-mono tone-dim" style={{ marginTop: 4 }}>
            {formatDateWithDow(run.runOn)} · {run.truckLabel ?? "Truck unassigned"} ·{" "}
            {driverName ?? "Driver unassigned"}
          </p>
        </div>
        <Placard
          label={run.status}
          tone={run.status === "done" ? "good" : run.status === "planned" ? "dim" : "accent"}
        />
      </div>

      {/* --- load list: what goes on the truck --- */}
      <section style={{ marginTop: 32 }}>
        <div className="between">
          <h2 className="t-label">Load list</h2>
          <span className="t-mono tone-dim">
            {totals.itemLines} item{totals.itemLines === 1 ? "" : "s"} · {totals.units} units
          </span>
        </div>
        {loadList.length === 0 ? (
          <p className="t-secondary" style={{ marginTop: 8 }}>
            Nothing on the truck yet. Add a stop and the load list aggregates every line on it.
          </p>
        ) : (
          <div className="stack" style={{ marginTop: 8 }}>
            {loadList.map((entry) => (
              <div key={entry.itemId} className="row">
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p className="t-title">{entry.itemName}</p>
                  <p className="t-mono tone-dim" style={{ marginTop: 2 }}>
                    {entry.category ?? "Uncategorised"} ·{" "}
                    {entry.perStop.map((s) => `#${s.orderNumber}: ${s.quantity}`).join("  ")}
                  </p>
                </div>
                <span className="t-count" style={{ fontSize: 30, lineHeight: 1 }}>
                  {entry.quantity}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* --- stops in sequence --- */}
      <section style={{ marginTop: 32 }}>
        <h2 className="t-label">Stops, in order</h2>
        {stops.length === 0 ? (
          <p className="t-secondary" style={{ marginTop: 8 }}>
            No stops yet.
          </p>
        ) : (
          <div className="stack" style={{ marginTop: 8 }}>
            {stops.map((stop, index) => (
              <div key={stop.orderId} className="row row-stack">
                <div className="between" style={{ width: "100%" }}>
                  <div style={{ minWidth: 0 }}>
                    <p className="t-title">
                      {index + 1}. #{stop.orderNumber} · {stop.customerName}
                    </p>
                    <p className="t-secondary" style={{ marginTop: 2, whiteSpace: "pre-wrap" }}>
                      {stop.address ?? "Customer pickup from the yard"}
                    </p>
                    <p className="t-mono tone-dim" style={{ marginTop: 2 }}>
                      {stop.itemCount} lines · {stop.unitCount} units
                    </p>
                  </div>
                  <Link href={`/orders/${stop.orderId}`} className="btn-quiet">
                    Order
                  </Link>
                </div>
                <div style={{ display: "flex", gap: 12, width: "100%" }}>
                  <MoveForm
                    runId={run.id}
                    orderId={stop.orderId}
                    direction="up"
                    disabled={!gate.allowed || index === 0}
                  />
                  <MoveForm
                    runId={run.id}
                    orderId={stop.orderId}
                    direction="down"
                    disabled={!gate.allowed || index === stops.length - 1}
                  />
                  <ActionForm
                    action={removeStopAction}
                    submitLabel="Remove"
                    variant="quiet"
                    full={false}
                    showMessage={false}
                    disabled={!gate.allowed}
                  >
                    <input type="hidden" name="runId" value={run.id} />
                    <input type="hidden" name="orderId" value={stop.orderId} />
                  </ActionForm>
                </div>
              </div>
            ))}
          </div>
        )}
        <div style={{ marginTop: 20 }}>
          <AddStopForm
            runId={run.id}
            candidates={candidates}
            action={addStopAction}
            disabled={!gate.allowed}
          />
        </div>
      </section>

      {/* --- driver check-off --- */}
      {stops.length > 0 ? (
        <section style={{ marginTop: 32 }}>
          <div className="between">
            <h2 className="t-label">
              Driver check-off — {direction === "out" ? "out-photos at load" : "in-photos at return"}
            </h2>
            <span className="t-mono tone-dim">
              {checked}/{totalLines}
            </span>
          </div>
          <p className="t-secondary" style={{ marginTop: 4 }}>
            Photograph each line as it goes on the truck. These are the left-hand half of the photo
            pair, and the only reason a damage claim is not a memory contest.
          </p>
          <div className="stack" style={{ marginTop: 12, gap: 24 }}>
            {checkoff.map(({ stop, lines, byLine, photoCounts }) => (
              <div key={stop.orderId}>
                <p className="t-title">
                  #{stop.orderNumber} · {stop.customerName}
                </p>
                <div className="stack" style={{ marginTop: 4 }}>
                  {lines.map((line) => {
                    const existing = byLine.get(line.id);
                    return (
                      <CheckInRow
                        key={line.id}
                        orderId={stop.orderId}
                        orderLineId={line.id}
                        itemName={line.itemName}
                        quantity={line.quantity}
                        direction={direction}
                        action={recordCheckAction}
                        existing={
                          existing
                            ? {
                                quantityOk: existing.quantityOk,
                                quantityDamaged: existing.quantityDamaged,
                                quantityMissing: existing.quantityMissing,
                              }
                            : null
                        }
                        checkId={existing?.id ?? null}
                        photoCount={photoCounts.get(line.id) ?? 0}
                        disabled={!gate.allowed}
                      />
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {/* --- assignment, status, sheet --- */}
      <section style={{ marginTop: 32 }}>
        <h2 className="t-label">Truck and driver</h2>
        <div style={{ marginTop: 12 }}>
          <AssignRunForm
            runId={run.id}
            action={setRunDriverAction}
            drivers={staff}
            driverUserId={run.driverUserId}
            truckLabel={run.truckLabel}
            disabled={!gate.allowed}
          />
        </div>
      </section>

      <section style={{ marginTop: 32 }}>
        <h2 className="t-label">Run status</h2>
        <div style={{ display: "flex", gap: 12, marginTop: 12, flexWrap: "wrap" }}>
          {(["planned", "loaded", "out", "done"] as const).map((status) => (
            <ActionForm
              key={status}
              action={setRunStatusAction}
              submitLabel={status}
              variant={run.status === status ? "primary" : "secondary"}
              full={false}
              showMessage={false}
              disabled={!gate.allowed || run.status === status}
            >
              <input type="hidden" name="runId" value={run.id} />
              <input type="hidden" name="status" value={status} />
            </ActionForm>
          ))}
        </div>
      </section>

      <section style={{ marginTop: 32 }}>
        <h2 className="t-label">Run sheet</h2>
        <div style={{ marginTop: 12 }}>
          <ActionForm
            action={renderRunSheetAction}
            submitLabel={run.sheetR2Key ? "Re-render the run sheet" : "Render the run sheet"}
            variant="secondary"
            disabled={!gate.allowed || stops.length === 0}
            disabledReason={stops.length === 0 ? "Add a stop first." : gate.reason}
          >
            <input type="hidden" name="runId" value={run.id} />
          </ActionForm>
          {run.sheetR2Key ? (
            /* A plain download anchor, not next/link — prefetching a document
               route on hover is a request nobody asked for. */
            <a
              href={fileUrl(run.sheetR2Key)}
              className="btn btn-primary btn-full"
              style={{ marginTop: 12 }}
              download={`run-${run.runOn}-${run.kind}.pdf`}
            >
              <IconDocument />
              Download the run sheet
            </a>
          ) : null}
        </div>
      </section>
    </main>
  );
}

function MoveForm({
  runId,
  orderId,
  direction,
  disabled,
}: {
  runId: string;
  orderId: string;
  direction: "up" | "down";
  disabled: boolean;
}) {
  return (
    <ActionForm
      action={moveStopAction}
      submitLabel={direction === "up" ? "Earlier" : "Later"}
      variant="quiet"
      full={false}
      showMessage={false}
      disabled={disabled}
    >
      <input type="hidden" name="runId" value={runId} />
      <input type="hidden" name="orderId" value={orderId} />
      <input type="hidden" name="direction" value={direction} />
    </ActionForm>
  );
}

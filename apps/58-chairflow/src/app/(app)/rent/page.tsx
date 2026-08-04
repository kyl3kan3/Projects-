import type { Metadata } from "next";
import Link from "next/link";
import {
  AddChairForm,
  AssignChairForm,
  CreateShopForm,
  MarkPaidForm,
  RolloverForm,
  SendRentLinkForm,
  UpdateRentForm,
  WaiveRentForm,
} from "@/app/(app)/rent/RentForms";
import { DetailRow, EmptyState, Figure, ScreenHeader } from "@/components/ui";
import { ownedShop, requireAccount } from "@/lib/auth";
import { redirect } from "next/navigation";
import { formatDayShort } from "@/lib/dates";
import { money, moneyShort } from "@/lib/format";
import { daysLate, displayRentStatus, rentStatusLabel, rentTotals } from "@/lib/rent";
import { ownerGrid, renterPeriods, shopChairs } from "@/server/rent";

export const metadata: Metadata = { title: "Rent" };

/**
 * The chair-rent ledger — one screen, two viewers.
 *
 * A shop owner sees the chairs x weeks grid and the controls. A renter sees their own weeks,
 * the same rows, read-only. That is the whole feature: the crumpled envelope replaced by one
 * record neither side can quietly rewrite.
 *
 * Lateness is computed per cell against today, not stored, so a week from two months ago
 * never reads "Due".
 */
export default async function RentPage({
  searchParams,
}: {
  searchParams: Promise<{ cell?: string }>;
}) {
  const { user, stylist } = await requireAccount();
  const shop = await ownedShop(user.id);
  const params = await searchParams;

  if (!shop) {
    // No shop owned: this is a renter's own view of the same rows the owner reads.
    if (!stylist) redirect("/login");
    const mine = await renterPeriods(stylist.id);
    return (
      <>
        <ScreenHeader label="Chair rent" title="Your rent" />
        {mine.length === 0 ? (
          <>
            <EmptyState
              icon="key-rent"
              title="No rent ledger yet"
              body="If you rent a chair, ask your shop owner to add you — they enter your handle and both of you read the same rows. If you own the shop, create it here."
            />
            <section style={{ paddingTop: 24 }}>
              <p className="t-label" style={{ margin: "0 0 12px" }}>
                Own the shop?
              </p>
              <CreateShopForm />
            </section>
          </>
        ) : (
          <>
            <RenterLedger periods={mine} />
            <p style={{ marginTop: 24 }} className="t-secondary">
              This is the same ledger your shop owner sees. Rent is marked paid by them; nothing
              here charges you automatically, and ChairFlow takes no cut of chair rent.
            </p>
          </>
        )}
      </>
    );
  }

  const grid = await ownerGrid({ shopId: shop.id, weekCount: 6 });
  const chairs = await shopChairs(shop.id);
  const allPeriods = grid.rows.flatMap((r) =>
    r.cells.map((c) => c.period).filter((p): p is NonNullable<typeof p> => Boolean(p)),
  );
  const totals = rentTotals(allPeriods, grid.today);
  const selected = params.cell
    ? allPeriods.find((p) => p.id === params.cell) ?? null
    : null;
  const selectedChair = selected
    ? chairs.find((c) => c.chair.id === selected.chairId) ?? null
    : null;

  return (
    <>
      <ScreenHeader
        label={shop.name}
        title="Rent ledger"
        action={<RolloverForm />}
      />

      <section
        style={{
          display: "flex",
          gap: 24,
          flexWrap: "wrap",
          paddingBottom: 20,
          borderBottom: "1px solid var(--color-hairline)",
        }}
      >
        <Figure label="Collected" value={money(totals.paidCents)} tone="green" />
        <Figure label="Due" value={money(totals.dueCents)} />
        <Figure label="Late" value={money(totals.lateCents)} tone={totals.lateCents > 0 ? "red" : undefined} />
        <Figure label="Waived" value={money(totals.waivedCents)} />
      </section>

      <section style={{ padding: "20px 0" }}>
        <p className="t-label" style={{ margin: "0 0 12px" }}>
          Chairs x weeks
        </p>
        {grid.rows.length === 0 ? (
          <EmptyState
            icon="key-rent"
            title="No chairs yet"
            body="Add a chair, set its weekly rent, and assign the renter by their ChairFlow handle."
          />
        ) : (
          <div className="scroll-x">
            <div style={{ display: "grid", gap: 4, minWidth: "max-content" }}>
              <div style={{ display: "grid", gridAutoFlow: "column", gridAutoColumns: "minmax(64px, 1fr)", gap: 4 }}>
                <div style={{ minWidth: 120 }} />
                {grid.weeks.map((week) => (
                  <div key={week} className="t-label" style={{ minWidth: 64, textAlign: "center" }}>
                    {formatDayShort(week)}
                  </div>
                ))}
              </div>
              {grid.rows.map((row) => (
                <div
                  key={row.chair.id}
                  style={{ display: "grid", gridAutoFlow: "column", gridAutoColumns: "minmax(64px, 1fr)", gap: 4 }}
                >
                  <div style={{ minWidth: 120, display: "grid", gap: 2, alignContent: "center" }}>
                    <span className="t-title">{row.chair.label}</span>
                    <span className="t-secondary">
                      {row.stylist ? `@${row.stylist.handle}` : "vacant"}
                    </span>
                  </div>
                  {row.cells.map((cell, i) =>
                    cell.period ? (
                      <Link
                        key={`${row.chair.id}-${i}`}
                        href={`/rent?cell=${cell.period.id}`}
                        className="rent-cell"
                        data-state={cell.display ?? "none"}
                      >
                        <span>{moneyShort(cell.period.amountCents)}</span>
                        <span style={{ fontSize: "0.5625rem" }}>
                          {rentStatusLabel(cell.display ?? "due")}
                        </span>
                      </Link>
                    ) : (
                      <div key={`${row.chair.id}-${i}`} className="rent-cell" data-state="none">
                        <span>—</span>
                      </div>
                    ),
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {selected && selectedChair && (
        <section
          className="sheet"
          style={{ padding: 16, marginBottom: 20, display: "grid", gap: 12 }}
        >
          <div>
            <p className="t-label" style={{ margin: 0 }}>
              {selectedChair.chair.label} · week of {formatDayShort(selected.weekStartOn)}
            </p>
            <p className="t-h2" style={{ margin: "4px 0 0" }}>
              {money(selected.amountCents)}
            </p>
            <p className="t-secondary" style={{ margin: "4px 0 0" }}>
              {rentStatusLabel(displayRentStatus(selected, grid.today))}
              {displayRentStatus(selected, grid.today) === "late"
                ? ` · ${daysLate(selected.weekStartOn, grid.today)} days late`
                : ""}
              {selected.paidAt ? ` · paid ${formatDayShort(grid.today)}` : ""}
              {selectedChair.stylist ? ` · @${selectedChair.stylist.handle}` : ""}
            </p>
          </div>
          {selected.status === "due" && (
            <>
              <MarkPaidForm rentPeriodId={selected.id} label={money(selected.amountCents)} />
              <SendRentLinkForm rentPeriodId={selected.id} />
              <WaiveRentForm rentPeriodId={selected.id} />
            </>
          )}
          <Link className="btn-quiet" href="/rent">
            Close
          </Link>
        </section>
      )}

      <section style={{ padding: "20px 0", borderTop: "1px solid var(--color-hairline)" }}>
        <p className="t-label" style={{ margin: "0 0 12px" }}>
          Chairs
        </p>
        <div className="stack" style={{ gap: 20 }}>
          {chairs.map(({ chair, stylist: renter }) => (
            <div key={chair.id} className="stack" style={{ gap: 8 }}>
              <p className="t-title" style={{ margin: 0 }}>
                {chair.label} · {moneyShort(chair.weeklyRentCents)}/week ·{" "}
                {renter ? `@${renter.handle}` : "vacant"}
              </p>
              <AssignChairForm chairId={chair.id} handle={renter?.handle ?? ""} />
              <UpdateRentForm chairId={chair.id} rent={(chair.weeklyRentCents / 100).toFixed(2)} />
            </div>
          ))}
        </div>
      </section>

      <section style={{ padding: "20px 0", borderTop: "1px solid var(--color-hairline)" }}>
        <p className="t-label" style={{ margin: "0 0 12px" }}>
          Add a chair
        </p>
        <AddChairForm />
      </section>
    </>
  );
}

function RenterLedger({ periods }: { periods: Awaited<ReturnType<typeof renterPeriods>> }) {
  const today = new Date().toISOString().slice(0, 10);
  const totals = rentTotals(periods, today);
  return (
    <>
      <section
        style={{
          display: "flex",
          gap: 24,
          flexWrap: "wrap",
          paddingBottom: 20,
          borderBottom: "1px solid var(--color-hairline)",
        }}
      >
        <Figure label="Paid" value={money(totals.paidCents)} tone="green" />
        <Figure label="Due" value={money(totals.dueCents)} />
        <Figure label="Late" value={money(totals.lateCents)} tone={totals.lateCents > 0 ? "red" : undefined} />
      </section>
      <section style={{ paddingTop: 20 }}>
        {periods.map((p) => (
          <DetailRow key={p.id} term={`Week of ${formatDayShort(p.weekStartOn)}`}>
            {money(p.amountCents)}
            <span className="t-secondary" style={{ display: "block" }}>
              {rentStatusLabel(displayRentStatus(p, today))}
            </span>
          </DetailRow>
        ))}
      </section>
    </>
  );
}

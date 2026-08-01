import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { tradeImages } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { closedTradesFor, getTrade, listSetups, tradeLegs } from "@/lib/trades";
import { displaySymbol } from "@/lib/instruments";
import {
  formatCents,
  formatPrice,
  formatQty,
  formatR,
  priceToNumber,
} from "@/lib/money";
import { formatHold, zonedClock, zonedDateKey } from "@/lib/tz";
import { segmentBySetup } from "@/lib/analytics";
import { plan } from "@/lib/plans";
import { pnlClass } from "@/components/Money";
import { DrawOnce } from "@/components/DrawOnce";
import { TradeChart, type FillPoint } from "./TradeChart";
import { TradeForm } from "./TradeForm";
import { ImageForm } from "./ImageForm";
import { IconChevronRight } from "@/components/icons";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const user = await requireUser();
  const trade = await getTrade(user.id, id);
  if (!trade) return { title: "Trade" };
  return { title: `${displaySymbol(trade.assetClass, trade.symbol)} · trade` };
}

export default async function TradeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const trade = await getTrade(user.id, id);
  if (!trade) notFound();

  const limits = plan(user.plan);
  const [legs, setups, images, closed] = await Promise.all([
    tradeLegs(trade.id),
    listSetups(user.id),
    getDb().select().from(tradeImages).where(eq(tradeImages.tradeId, trade.id)),
    limits.setups && trade.setupId ? closedTradesFor(user.id) : Promise.resolve([]),
  ]);

  const setupStats = trade.setupId
    ? segmentBySetup(closed).find((segment) => segment.key === trade.setupId)
    : undefined;

  const fills: FillPoint[] = legs.map(({ leg }) => ({
    role: leg.role,
    price: priceToNumber(leg.price),
    label: leg.role === "open" ? "Entry" : "Exit",
    priceLabel: formatPrice(leg.price),
  }));

  const symbol = displaySymbol(trade.assetClass, trade.symbol);
  const isClosed = trade.status === "closed";

  return (
    <main className="screen">
      <header className="pt-8 pb-6">
        <Link href="/journal" className="t-label no-underline">
          Journal
        </Link>
        <h1 className="t-h2 mt-3">{symbol}</h1>
        <p className="t-secondary mt-1">
          {trade.direction === "long" ? "Long" : "Short"} {formatQty(trade.qtyMax)} ·{" "}
          {zonedDateKey(trade.openedAt, user.timezone)}{" "}
          {zonedClock(trade.openedAt, user.timezone)}
          {isClosed && trade.closedAt
            ? ` → ${zonedClock(trade.closedAt, user.timezone)} · held ${formatHold(trade.holdSeconds)}`
            : " · still open"}
        </p>
        <p className={`t-stat mt-4 ${pnlClass(isClosed ? trade.netPnlCents : (trade.unrealizedPnlCents ?? 0n))}`}>
          {isClosed
            ? formatCents(trade.netPnlCents, { signed: true })
            : trade.unrealizedPnlCents !== null
              ? formatCents(trade.unrealizedPnlCents, { signed: true })
              : "—"}
        </p>
        <p className="t-secondary mt-2">
          {isClosed ? (
            <>
              {formatCents(trade.grossPnlCents, { signed: true })} gross, less{" "}
              {formatCents(trade.feesCents)} in fees · {formatR(trade.rMultiple ?? null)}
            </>
          ) : (
            <>
              {formatQty(trade.qtyOpen)} still open
              {trade.markPrice !== null
                ? ` · unrealised at the last fill we have seen (${formatPrice(trade.markPrice)}), not a live quote`
                : " · no mark available"}
            </>
          )}
        </p>
      </header>

      <div className="film-room">
        <div>
          <section className="mb-6">
            <h2 className="t-label mb-3">Your fills</h2>
            <DrawOnce sessionKey={`trade-${trade.id}`}>
              <TradeChart
                fills={fills}
                stop={trade.stopPrice === null ? null : priceToNumber(trade.stopPrice)}
              />
            </DrawOnce>
            <p className="t-secondary mt-3">
              Filled prices only — solid pins are entries, hollow pins are exits. TradeLog has no
              market-data feed, so it will not draw price action it cannot verify.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="t-label mb-2">Executions</h2>
            <div className="table-scroll">
              <table className="exec">
                <thead>
                  <tr>
                    <th scope="col">Round trip</th>
                    <th scope="col">Qty</th>
                    <th scope="col">Price</th>
                    <th scope="col">Fees</th>
                    <th scope="col">Time</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>
                      {symbol} · {trade.direction}
                    </td>
                    <td>{formatQty(trade.qtyMax)}</td>
                    <td>
                      {formatPrice(trade.avgEntry)}
                      {trade.avgExit !== null ? ` → ${formatPrice(trade.avgExit)}` : ""}
                    </td>
                    <td>{formatCents(trade.feesCents)}</td>
                    <td>{zonedClock(trade.openedAt, user.timezone)}</td>
                  </tr>
                  {legs.map(({ leg, execution }) => (
                    <tr key={`${leg.executionId}-${leg.seq}`} className="leg">
                      <td>
                        {leg.role === "open" ? "Entry" : "Exit"}
                        {execution.brokerRef ? ` · ${execution.brokerRef}` : ""}
                      </td>
                      <td>{formatQty(leg.qty)}</td>
                      <td>{formatPrice(leg.price)}</td>
                      <td>{formatCents(leg.feesCents)}</td>
                      <td>{zonedClock(leg.executedAt, user.timezone)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="t-secondary mt-3">
              A fill split between two round trips appears under both, with its quantity and its
              share of the commission — that is the matching audit trail.
            </p>
          </section>
        </div>

        <div className="flex flex-col gap-8">
          {setupStats ? (
            <section>
              <h2 className="t-label mb-2">Setup</h2>
              <p className="t-body">{trade.setupName}</p>
              <p className="t-secondary mt-1">
                {setupStats.count} trades ·{" "}
                <span className={pnlClass(setupStats.netCents)}>
                  {formatCents(setupStats.netCents, { signed: true })}
                </span>{" "}
                net · {formatCents(setupStats.expectancyCents ?? 0n, { signed: true })} a trade
              </p>
            </section>
          ) : null}

          <TradeForm
            tradeId={trade.id}
            stopPrice={trade.stopPrice === null ? "" : formatPrice(trade.stopPrice)}
            setupId={trade.setupId}
            setups={setups.map((s) => ({ id: s.id, name: s.name }))}
            emotionTags={trade.emotionTags}
            notes={trade.notes ?? ""}
            setupsAllowed={limits.setups}
          />

          <ImageForm
            tradeId={trade.id}
            images={images.map((image) => ({
              id: image.id,
              caption: image.caption,
              byteSize: image.byteSize,
            }))}
            allowed={limits.chartImages}
          />

          <section>
            <h2 className="t-label mb-2">Where this trade sits</h2>
            <Link href="/insights" className="row no-underline">
              <span className="t-body flex-1">Findings that include this trade</span>
              <IconChevronRight size={16} />
            </Link>
          </section>
        </div>
      </div>
    </main>
  );
}

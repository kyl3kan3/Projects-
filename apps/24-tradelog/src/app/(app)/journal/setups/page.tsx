import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { closedTradesFor, listSetups } from "@/lib/trades";
import { segmentBySetup } from "@/lib/analytics";
import { formatCents, formatPercent } from "@/lib/money";
import { plan } from "@/lib/plans";
import { pnlClass } from "@/components/Money";
import { HoldToConfirm } from "@/components/HoldToConfirm";
import { SetupForm } from "./SetupForm";
import { deleteSetupAction } from "../actions";

export const metadata: Metadata = { title: "Playbook" };
export const dynamic = "force-dynamic";

export default async function SetupsPage() {
  const user = await requireUser();
  const limits = plan(user.plan);
  const [setups, closed] = await Promise.all([listSetups(user.id), closedTradesFor(user.id)]);
  const segments = new Map(segmentBySetup(closed).map((segment) => [segment.key, segment]));

  return (
    <main className="screen">
      <header className="pt-8 pb-6">
        <Link href="/journal" className="t-label no-underline">
          Journal
        </Link>
        <h1 className="t-h2 mt-3">Playbook</h1>
        <p className="t-secondary mt-1">
          Your setups, each with the expectancy it has actually earned. A setup with fewer than eight
          trades gets a count and no verdict.
        </p>
      </header>

      {!limits.setups ? (
        <section className="card p-5">
          <p className="t-finding">Playbooks are a Trader feature.</p>
          <p className="t-secondary mt-2">
            Naming your setups is what turns a journal into an edge report: TradeLog can then tell you
            that ORB breakouts earn +$0.40 a share and VWAP fades cost you $45 a trade. $19/mo.
          </p>
          <Link href="/settings/billing" className="btn-quiet mt-4 inline-block">
            See the plans
          </Link>
        </section>
      ) : (
        <>
          {setups.length ? (
            <ul className="mb-8">
              {setups.map((setup) => {
                const segment = segments.get(setup.id);
                return (
                  <li key={setup.id} className="row items-start">
                    <span
                      aria-hidden="true"
                      className="mt-2"
                      style={{
                        width: 10,
                        height: 10,
                        borderRadius: 2,
                        background: `var(--color-${setup.color})`,
                        flex: "none",
                      }}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="t-body">{setup.name}</p>
                      {setup.rulesNotes ? (
                        <p className="t-secondary mt-1">{setup.rulesNotes}</p>
                      ) : null}
                      <p className="t-secondary mt-2">
                        {segment ? (
                          <>
                            {segment.count} trades ·{" "}
                            <span className={pnlClass(segment.netCents)}>
                              {formatCents(segment.netCents, { signed: true })}
                            </span>{" "}
                            net
                            {segment.count >= 8 ? (
                              <>
                                {" · "}
                                {formatCents(segment.expectancyCents ?? 0n, { signed: true })} a trade
                                {" · "}
                                {formatPercent(segment.winRatePct)} win rate
                              </>
                            ) : (
                              " · too few trades to call it"
                            )}
                          </>
                        ) : (
                          "No trades tagged yet"
                        )}
                      </p>
                    </div>
                    <HoldToConfirm
                      label="Delete"
                      holdingLabel="Hold to delete"
                      onConfirm={deleteSetupAction.bind(null, setup.id)}
                    />
                  </li>
                );
              })}
            </ul>
          ) : (
            <section className="card mb-8 p-5">
              <p className="t-finding">No setups yet.</p>
              <p className="t-secondary mt-2">
                Most traders start with two or three: an opening-range breakout, a VWAP fade, and a
                trend continuation. Name them the way you say them out loud.
              </p>
            </section>
          )}

          <section>
            <h2 className="t-label mb-4">Add a setup</h2>
            <SetupForm />
          </section>
        </>
      )}
    </main>
  );
}

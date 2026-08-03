import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { listApis, planState } from "@/lib/queries";
import { canAddApi, PLANS, trialDaysLeft } from "@/lib/plans";
import { relativeTime } from "@/lib/format";
import { AppHeader, ScreenTitle } from "@/components/ScreenHeader";
import { VerdictWord } from "@/components/Verdict";
import { IconChevronRight, IconTag } from "@/components/icons";
import { NewApiForm } from "./NewApiForm";

export const metadata: Metadata = { title: "APIs" };
export const dynamic = "force-dynamic";

export default async function ApisPage() {
  const { org } = await requireUser();
  const rows = await listApis(org.id);
  const state = await planState(org);
  const now = new Date();
  const gate = canAddApi(state, now);
  const daysLeft = trialDaysLeft(state, now);

  return (
    <>
      <AppHeader
        trialNote={
          daysLeft !== null
            ? daysLeft === 0
              ? "Trial ended"
              : `${daysLeft} day${daysLeft === 1 ? "" : "s"} of trial`
            : null
        }
      />
      <main className="screen gutter" style={{ paddingTop: 24 }}>
        <div className="wrap" style={{ maxWidth: 720 }}>
          <ScreenTitle
            title="Watched APIs"
            subtitle={`${PLANS[org.plan].name} · ${rows.length} of ${PLANS[org.plan].apiLimit} API${
              PLANS[org.plan].apiLimit === 1 ? "" : "s"
            }`}
          />

          {rows.length === 0 ? (
            <section style={{ marginBottom: 40 }}>
              <p className="t-body" style={{ margin: "0 0 8px" }}>
                Nothing is being watched yet.
              </p>
              <p className="t-secondary" style={{ margin: "0 0 24px" }}>
                Add the API whose consumers you would have to apologise to. Then push a spec from CI and the
                first diff appears here.
              </p>
            </section>
          ) : (
            <section className="rows hairline-t hairline-b" style={{ marginBottom: 40 }}>
              {rows.map((row) => (
                <Link
                  key={row.api.id}
                  href={`/apis/${row.api.slug}`}
                  className="row"
                  style={{ color: "inherit", textDecoration: "none" }}
                >
                  <IconTag size={18} style={{ color: "var(--color-text-3-aa)", flex: "none" }} />
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span className="t-title" style={{ display: "block" }}>
                      {row.api.name}
                    </span>
                    <span className="t-data" style={{ color: "var(--color-text-2)", display: "block" }}>
                      {row.api.slug}
                    </span>
                    <span className="t-secondary" style={{ display: "block", marginTop: 2 }}>
                      {row.deployCount === 0
                        ? "No deploys pushed yet"
                        : `${row.deployCount} deploy${row.deployCount === 1 ? "" : "s"} · last ${relativeTime(
                            row.lastPushedAt ?? now,
                            now,
                          )}`}
                      {row.consumerCount > 0
                        ? ` · ${row.consumerCount} consumer${row.consumerCount === 1 ? "" : "s"}`
                        : ""}
                      {row.draftCount > 0
                        ? ` · ${row.draftCount} changelog draft${row.draftCount === 1 ? "" : "s"}`
                        : ""}
                    </span>
                  </span>
                  <span style={{ display: "flex", alignItems: "center", gap: 8, flex: "none" }}>
                    {row.lastVerdict ? <VerdictWord level={row.lastVerdict} /> : null}
                    <IconChevronRight size={18} style={{ color: "var(--color-text-3-aa)" }} />
                  </span>
                </Link>
              ))}
            </section>
          )}

          <section>
            <h2 className="t-h2" style={{ margin: "0 0 20px", fontSize: 18 }}>
              Add an API
            </h2>
            <NewApiForm blocked={gate.allowed ? null : gate.message} />
          </section>
        </div>
      </main>
    </>
  );
}

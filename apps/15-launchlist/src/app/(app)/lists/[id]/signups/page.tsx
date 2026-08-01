import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { listCounters, ownedList } from "@/lib/lists";
import { creditedCountsFor, reviewQueue, signupPage } from "@/lib/signups";
import { count, maskEmail, rankLabel, relativeTime } from "@/lib/format";
import { fraudSummary } from "@/lib/fraud";
import { ListHeader } from "@/components/ListHeader";
import { ReviewRow } from "./ReviewRow";
import { IconDownload } from "@/components/icons";

export const metadata: Metadata = { title: "Signups" };
export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

export default async function SignupsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ page?: string; filter?: string }>;
}) {
  const user = await requireUser();
  const list = await ownedList(user.id, (await params).id);
  if (!list) notFound();
  const { page: pageParam, filter } = await searchParams;
  const page = Math.max(1, Number(pageParam ?? 1) || 1);

  const [counters, rows, review] = await Promise.all([
    listCounters(list.id),
    signupPage(list.id, { limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE }),
    reviewQueue(list.id),
  ]);
  const referralCounts = await creditedCountsFor(rows.map((r) => r.id));
  const now = new Date();
  const hasMore = counters.inQueue > page * PAGE_SIZE;

  return (
    <main className="screen">
      <ListHeader
        list={list}
        section="Signups"
        detail={
          <p className="t-secondary">
            {count(counters.inQueue)} in line · {count(counters.pending)} unconfirmed ·{" "}
            {count(counters.blocked)} rejected
          </p>
        }
      />

      {review.length > 0 ? (
        <section style={{ marginBottom: 40 }}>
          <p className="t-label" style={{ color: "var(--color-red)" }}>
            Review queue — {review.length}
          </p>
          <p className="t-secondary" style={{ marginTop: 8 }}>
            Held because something looked automated. They keep their place in line; their referrer
            is not paid until you approve.
          </p>
          <ul style={{ marginTop: 12 }}>
            {review.map((signup) => (
              <ReviewRow
                key={signup.id}
                listId={list.id}
                signupId={signup.id}
                email={signup.email}
                position={signup.position}
                summary={fraudSummary({ score: signup.fraudScore, reasons: signup.fraudReasons })}
              />
            ))}
          </ul>
        </section>
      ) : filter === "review" ? (
        <p className="t-secondary" style={{ marginBottom: 40 }}>
          Nothing is waiting for review.
        </p>
      ) : null}

      <section>
        <p className="t-label">In queue order</p>
        {rows.length === 0 ? (
          <p className="t-secondary" style={{ marginTop: 12 }}>
            Nobody has confirmed yet. Unconfirmed addresses don&apos;t hold a position — that is
            what stops a list filling with typos and bots.
          </p>
        ) : (
          <ul style={{ marginTop: 12 }}>
            {rows.map((signup) => {
              const referrals = referralCounts.get(signup.id) ?? 0;
              return (
                <li key={signup.id} className="row">
                  <span className="t-data" style={{ flex: "none", width: 36, color: "var(--color-text-3)" }}>
                    {rankLabel(signup.position)}
                  </span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span className="t-data" style={{ display: "block" }}>
                      {maskEmail(signup.email)}
                    </span>
                    <span className="t-secondary">
                      joined {relativeTime(signup.createdAt, now)}
                      {signup.status === "review" ? " · held" : ""}
                      {signup.status === "unsubscribed" ? " · unsubscribed" : ""}
                      {signup.boostPoints > 0 ? ` · +${signup.boostPoints} boost` : ""}
                    </span>
                  </span>
                  <span className="t-data" style={{ flex: "none" }}>
                    {referrals > 0 ? `${referrals}×` : "—"}
                  </span>
                </li>
              );
            })}
          </ul>
        )}

        {rows.length > 0 ? (
          <nav style={{ display: "flex", gap: 12, marginTop: 20 }}>
            {page > 1 ? (
              <Link href={`/lists/${list.id}/signups?page=${page - 1}`} className="btn btn-secondary">
                Previous
              </Link>
            ) : null}
            {hasMore ? (
              <Link href={`/lists/${list.id}/signups?page=${page + 1}`} className="btn btn-secondary">
                Next {PAGE_SIZE}
              </Link>
            ) : null}
          </nav>
        ) : null}
      </section>

      <div className="thumb-cta">
        <a href={`/api/lists/${list.id}/export`} className="btn btn-primary btn-full">
          <IconDownload size={18} />
          Export CSV
        </a>
      </div>
    </main>
  );
}

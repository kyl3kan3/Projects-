import type { Metadata } from "next";
import Link from "next/link";
import { requireMerchant } from "@/lib/auth";
import { ReviewCard } from "@/components/ReviewCard";
import { IconCheck, IconMail, IconX } from "@/components/icons";
import { ago, count, inDays } from "@/lib/format";
import { countByStatus, listReviews } from "@/lib/reviews";
import { upcomingRequests } from "@/lib/requests";
import { ReplyForm } from "./ReplyForm";
import {
  approveAction,
  approveAllAction,
  hideAction,
  restoreAction,
  sendRequestNowAction,
} from "./actions";

export const metadata: Metadata = { title: "Reviews" };
export const dynamic = "force-dynamic";

type Tab = "waiting" | "published" | "hidden" | "queue";

const TABS: { id: Tab; label: string }[] = [
  { id: "waiting", label: "Waiting" },
  { id: "published", label: "Published" },
  { id: "hidden", label: "Hidden" },
  { id: "queue", label: "Queued requests" },
];

export default async function ReviewsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { store } = await requireMerchant();
  const requested = (await searchParams).tab;
  const tab: Tab = TABS.some((t) => t.id === requested) ? (requested as Tab) : "waiting";

  const byStatus = await countByStatus(store.id);

  return (
    <main className="screen">
      <header className="pt-8 pb-5">
        <p className="t-label">Moderation</p>
        <h1 className="t-h2 mt-2">
          {byStatus.pending === 0
            ? "Nothing waiting on you."
            : byStatus.pending === 1
              ? "One review is waiting."
              : `${count(byStatus.pending)} reviews are waiting.`}
        </h1>
        <p className="t-secondary mt-1">
          Four stars and up publish themselves. Every rating gets the same follow-up email — we do
          not gate requests by rating, and there is no setting that does.
        </p>
      </header>

      <nav className="mb-6 flex gap-2 overflow-x-auto pb-1" aria-label="Review status">
        {TABS.map((t) => (
          <Link
            key={t.id}
            href={`/reviews?tab=${t.id}`}
            className="chip no-underline"
            data-active={t.id === tab}
            aria-current={t.id === tab ? "page" : undefined}
          >
            {t.label}
            {t.id === "waiting" && byStatus.pending ? (
              <span className="t-data">{count(byStatus.pending)}</span>
            ) : null}
          </Link>
        ))}
      </nav>

      {tab === "queue" ? <QueueTab storeId={store.id} /> : <ListTab storeId={store.id} tab={tab} />}
    </main>
  );
}

async function ListTab({ storeId, tab }: { storeId: string; tab: Exclude<Tab, "queue"> }) {
  const status = tab === "waiting" ? "pending" : tab === "published" ? "approved" : "rejected";
  const rows = await listReviews(storeId, { status, limit: 60 });

  if (!rows.length) {
    return (
      <div className="card p-4">
        <p className="t-title">
          {tab === "waiting"
            ? "The queue is empty."
            : tab === "published"
              ? "Nothing is published yet."
              : "Nothing is hidden."}
        </p>
        <p className="t-secondary mt-2">
          {tab === "waiting"
            ? "Reviews below your auto-publish threshold land here, and so does everything an import brings in."
            : tab === "published"
              ? "Approved reviews appear here and, within seconds, in every widget on your storefront."
              : "Hiding a review keeps it in your history and pulls it from the widgets immediately."}
        </p>
      </div>
    );
  }

  return (
    <>
      {tab === "waiting" && rows.length > 1 ? (
        <form action={approveAllAction} className="mb-4">
          <input type="hidden" name="ids" value={rows.map((r) => r.review.id).join(",")} />
          <button className="btn btn-secondary btn-full" type="submit">
            <IconCheck size={18} />
            Approve all {count(rows.length)}
          </button>
        </form>
      ) : null}

      <div className="review-grid flex flex-col gap-5">
        {rows.map(({ review, media }) => (
          <div key={review.id}>
            <ReviewCard review={review} media={media} clamp={false} showStatus={tab !== "waiting"} />
            <div className="mt-3 flex gap-2">
              {review.status !== "approved" ? (
                <form action={approveAction} className="flex-1">
                  <input type="hidden" name="id" value={review.id} />
                  <button className="btn btn-primary btn-full" type="submit">
                    <IconCheck size={18} />
                    Approve
                  </button>
                </form>
              ) : null}
              {review.status !== "rejected" ? (
                <form action={hideAction} className="flex-1">
                  <input type="hidden" name="id" value={review.id} />
                  <button className="btn btn-secondary btn-full" type="submit">
                    <IconX size={18} />
                    Hide
                  </button>
                </form>
              ) : (
                <form action={restoreAction} className="flex-1">
                  <input type="hidden" name="id" value={review.id} />
                  <button className="btn btn-secondary btn-full" type="submit">
                    Move back to waiting
                  </button>
                </form>
              )}
            </div>
            {review.status === "approved" ? (
              <ReplyForm reviewId={review.id} existing={review.reply} />
            ) : null}
          </div>
        ))}
      </div>
    </>
  );
}

async function QueueTab({ storeId }: { storeId: string }) {
  const rows = await upcomingRequests(storeId, 40);

  if (!rows.length) {
    return (
      <div className="card p-4">
        <p className="t-title">No requests are queued.</p>
        <p className="t-secondary mt-2">
          A request is created when an order is fulfilled and goes out after your delay — fourteen
          days by default. Change it in Settings.
        </p>
      </div>
    );
  }

  return (
    <ul>
      {rows.map(({ request, order }) => (
        <li key={request.id} className="row">
          <span style={{ color: "var(--color-text-3)" }}>
            <IconMail size={20} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="t-title block truncate">{order.customerEmail}</span>
            <span className="t-secondary block truncate">
              {order.orderNumber ? `${order.orderNumber} · ` : ""}
              {order.lineItems[0]?.title ?? "Order"}
              {request.attempts > 0 && request.lastError ? ` · ${request.lastError}` : ""}
            </span>
          </span>
          <span className="t-data" style={{ color: "var(--color-text-2)" }}>
            {inDays(request.scheduledAt)}
          </span>
          <form action={sendRequestNowAction}>
            <input type="hidden" name="id" value={request.id} />
            <button className="btn-quiet" type="submit">
              Send now
            </button>
          </form>
        </li>
      ))}
      <li className="pt-4">
        <p className="t-secondary">
          Queued since {ago(rows[rows.length - 1].request.createdAt)}. Requests are sent by a
          scheduled sweep, so nothing is lost if a deploy happens mid-send.
        </p>
      </li>
    </ul>
  );
}

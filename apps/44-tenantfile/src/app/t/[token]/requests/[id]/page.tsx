import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { portalByToken, requestBelongsToTenancy } from "@/lib/portal";
import { markThreadRead, priorityLabel, requestStatusLabel, threadFor } from "@/lib/maintenance";
import { PhotoThread } from "@/components/PhotoThread";
import { formatMoney } from "@/lib/money";
import { TenantReplyForm } from "./TenantReplyForm";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Repair", robots: { index: false, follow: false } };

export default async function TenantRequestPage({
  params,
}: {
  params: Promise<{ token: string; id: string }>;
}) {
  const { token, id } = await params;
  const view = await portalByToken(token);
  if (!view) notFound();
  if (!(await requestBelongsToTenancy(view.tenancy.id, id))) notFound();

  const request = view.requests.find((r) => r.id === id);
  if (!request) notFound();

  const messages = await threadFor(id);
  if (request.tenantUnread > 0) await markThreadRead(id, "tenant");

  return (
    <main className="screen mx-auto max-w-[560px]" style={{ paddingBottom: 56 }}>
      <header className="pt-10 pb-6">
        <Link href={`/t/${token}`} className="btn-quiet no-underline">
          {view.address} {view.unitLabel}
        </Link>
        <h1 className="t-h2 mt-4">{request.title}</h1>
        <div className="mt-4 flex flex-wrap gap-2">
          <span className="pill" data-tone={request.status === "open" ? "amber" : "green"}>
            {requestStatusLabel(request.status)}
          </span>
          {request.priority !== "routine" ? (
            <span className="pill" data-tone={request.priority === "emergency" ? "red" : undefined}>
              {priorityLabel(request.priority)}
            </span>
          ) : null}
          {request.scheduledFor ? <span className="pill">Visit {request.scheduledFor}</span> : null}
        </div>
        {request.status === "done" && request.costCents != null ? (
          <p className="t-secondary mt-3">
            {view.landlord.name} recorded {formatMoney(request.costCents)} for the repair. You are not being charged for
            it — it is their record.
          </p>
        ) : null}
      </header>

      <section className="mb-8">
        <PhotoThread messages={messages} landlordName={view.landlord.name} tenantName="You" />
      </section>

      <TenantReplyForm token={token} requestId={id} />
    </main>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireLandlord } from "@/lib/auth";
import { landlordRequest, markThreadRead, priorityLabel, requestStatusLabel, threadFor } from "@/lib/maintenance";
import { PhotoThread } from "@/components/PhotoThread";
import { formatMoney } from "@/lib/money";
import { RequestControls } from "./RequestControls";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { landlord } = await requireLandlord();
  const owned = await landlordRequest(landlord.id, (await params).id);
  return { title: owned ? owned.request.title : "Request" };
}

export default async function RequestPage({ params }: { params: Promise<{ id: string }> }) {
  const { landlord, user } = await requireLandlord();
  const { id } = await params;
  const owned = await landlordRequest(landlord.id, id);
  if (!owned) notFound();

  const messages = await threadFor(id);
  if (owned.request.landlordUnread > 0) await markThreadRead(id, "landlord");

  return (
    <main className="screen">
      <header className="pt-8 pb-6">
        <Link href="/requests" className="btn-quiet no-underline">
          Requests
        </Link>
        <h1 className="t-h2 mt-4">{owned.request.title}</h1>
        <p className="t-secondary mt-1">
          {owned.address} <span className="t-data">{owned.unitLabel}</span> ·{" "}
          {owned.tenancy.tenantNames.join(", ") || "Tenant"}
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <span
            className="pill"
            data-tone={owned.request.status === "open" ? "amber" : owned.request.status === "closed" ? "green" : undefined}
          >
            {requestStatusLabel(owned.request.status)}
          </span>
          <span className="pill" data-tone={owned.request.priority === "emergency" ? "red" : undefined}>
            {priorityLabel(owned.request.priority)}
          </span>
          {owned.request.scheduledFor ? <span className="pill">Visit {owned.request.scheduledFor}</span> : null}
          {owned.request.costCents != null ? <span className="pill">{formatMoney(owned.request.costCents)}</span> : null}
        </div>
      </header>

      <section className="mb-8">
        <h2 className="t-label mb-3">The thread</h2>
        <PhotoThread
          messages={messages}
          landlordName={user.name || "You"}
          tenantName={owned.tenancy.tenantNames[0] ?? "Tenant"}
        />
      </section>

      <RequestControls
        requestId={id}
        status={owned.request.status}
        priority={owned.request.priority}
        scheduledFor={(owned.request.scheduledFor as string | null) ?? ""}
        costCents={owned.request.costCents}
        tenancyId={owned.tenancy.id}
      />
    </main>
  );
}

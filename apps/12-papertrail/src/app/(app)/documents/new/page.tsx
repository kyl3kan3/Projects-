import type { Metadata } from "next";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { clients } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { documentsCreatedThisMonth } from "@/lib/documents";
import { documentQuota, plan } from "@/lib/plans";
import { TEMPLATES, blankProposalBlocks, template } from "@/lib/templates";
import { docFormFromBlocks, type DocFormValues } from "@/lib/doc-form";
import { DocumentForm } from "../DocumentForm";
import { createProposalAction } from "../actions";
import { IconChevronLeft } from "@/components/icons";

export const metadata: Metadata = { title: "New proposal" };

export default async function NewProposalPage({
  searchParams,
}: {
  searchParams: Promise<{ template?: string; first?: string }>;
}) {
  const { template: templateId = "web-design", first } = await searchParams;
  const user = await requireUser();
  const db = getDb();

  const clientRows = await db.select().from(clients).where(eq(clients.userId, user.id));
  const used = await documentsCreatedThisMonth(user.id);
  const quota = documentQuota(user.plan, used);
  const limits = plan(user.plan);

  const ctx = {
    clientName: clientRows[0]?.name ?? "",
    clientCompany: clientRows[0]?.company ?? "",
    freelancerName: user.name?.trim() || user.email,
    currency: "USD",
  };

  const chosen = templateId === "blank" ? null : template(templateId);
  const blocks = chosen ? chosen.blocks(ctx) : blankProposalBlocks(ctx);
  const initial: DocFormValues = {
    ...docFormFromBlocks({
      blocks,
      document: {
        title: chosen ? chosen.title(ctx) : "",
        currency: "USD",
        taxRateBps: 0,
        taxLabel: "Tax",
        depositPercent: chosen?.depositPercent ?? 50,
        netDays: chosen?.netDays ?? 14,
      },
      client: {
        id: clientRows[0]?.id ?? "",
        name: clientRows[0]?.name ?? "",
        email: clientRows[0]?.email ?? "",
        company: clientRows[0]?.company ?? null,
      },
    }),
    clientId: null,
    clientName: "",
    clientEmail: "",
    clientCompany: "",
  };

  return (
    <main className="screen pt-6">
      <Link href="/documents" className="btn-quiet mb-4 inline-flex items-center gap-1">
        <IconChevronLeft size={16} />
        Documents
      </Link>

      <h1 className="t-h2">{first ? "Your first proposal" : "New proposal"}</h1>
      <p className="t-secondary mt-1">
        {first
          ? "Write it once. When the client accepts, the contract is drafted from exactly this — nothing retyped."
          : "The client sees a web page, not an attachment. Accepting it drafts the contract."}
      </p>

      {quota.limit !== Infinity ? (
        <p className="t-secondary hairline-b mt-4 pb-4">
          {quota.remaining > 0
            ? `${quota.remaining} of ${quota.limit} documents left on ${limits.name} this month. Contracts and invoices the chain creates for you don't count.`
            : `You've used all ${quota.limit} documents this month on ${limits.name}.`}
        </p>
      ) : null}

      <div className="mt-6">
        <DocumentForm
          initial={initial}
          clients={clientRows.map((c) => ({
            id: c.id,
            name: c.name,
            email: c.email,
            company: c.company,
          }))}
          action={createProposalAction}
          submitLabel="Save draft"
          templates={TEMPLATES.map((t) => ({ id: t.id, name: t.name, summary: t.summary }))}
          activeTemplateId={templateId}
        />
      </div>
    </main>
  );
}

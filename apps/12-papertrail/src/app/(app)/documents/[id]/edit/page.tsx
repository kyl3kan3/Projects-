import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { clients } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { loadBundle } from "@/lib/documents";
import { docFormFromBlocks } from "@/lib/doc-form";
import { DocumentForm } from "../../DocumentForm";
import { updateDraftAction } from "../../actions";
import { IconChevronLeft } from "@/components/icons";

export const metadata: Metadata = { title: "Edit draft" };

export default async function EditDocumentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const bundle = await loadBundle(id);
  if (!bundle || bundle.document.userId !== user.id) notFound();

  const { document, client, blocks } = bundle;
  const db = getDb();
  const clientRows = await db.select().from(clients).where(eq(clients.userId, user.id));

  if (document.status !== "draft") {
    return (
      <main className="screen pt-6">
        <Link href={`/documents/${id}`} className="btn-quiet mb-4 inline-flex items-center gap-1">
          <IconChevronLeft size={16} />
          Back
        </Link>
        <h1 className="t-h2">This document is out of your hands.</h1>
        <p className="t-secondary mt-2 max-w-[46ch]">
          It has been sent, so the version your client is reading is the version of record. To change
          the terms, void it and reissue — the chain keeps both, and the client's old link says it was
          replaced.
        </p>
      </main>
    );
  }

  const initial = docFormFromBlocks({
    blocks,
    document,
    client: { id: client.id, name: client.name, email: client.email, company: client.company },
  });

  return (
    <main className="screen pt-6">
      <Link href={`/documents/${id}`} className="btn-quiet mb-4 inline-flex items-center gap-1">
        <IconChevronLeft size={16} />
        Back
      </Link>
      <h1 className="t-h2">Edit the draft</h1>
      <p className="t-secondary mt-1">Nothing has gone to the client yet.</p>
      <div className="mt-6">
        <DocumentForm
          initial={initial}
          clients={clientRows.map((c) => ({
            id: c.id,
            name: c.name,
            email: c.email,
            company: c.company,
          }))}
          action={updateDraftAction}
          documentId={document.id}
          submitLabel="Save changes"
        />
      </div>
    </main>
  );
}

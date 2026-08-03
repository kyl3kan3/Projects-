import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { documents } from "@/db/schema";
import { requireOnboarded } from "@/lib/auth";
import { guessMapping } from "@/lib/spend";
import { previewSpendCsv } from "@/lib/spend-import";
import { MappingForm } from "./MappingForm";

export const metadata: Metadata = { title: "Map spend columns" };
export const dynamic = "force-dynamic";

export default async function MapSpendPage({
  params,
}: {
  params: Promise<{ documentId: string }>;
}) {
  const { documentId } = await params;
  const { org } = await requireOnboarded();
  const db = getDb();
  const [doc] = await db
    .select()
    .from(documents)
    .where(and(eq(documents.id, documentId), eq(documents.organizationId, org.id)));
  if (!doc || doc.kind !== "spend_csv") notFound();

  let file: Awaited<ReturnType<typeof previewSpendCsv>>;
  try {
    file = await previewSpendCsv(doc.id);
  } catch (err) {
    return (
      <main className="screen pt-5">
        <h1 className="t-h2">That file could not be read</h1>
        <p className="t-body mt-3" style={{ maxWidth: "48ch" }}>
          {err instanceof Error ? err.message : "The file is not a readable CSV."}
        </p>
        <p className="t-secondary mt-4">
          Export the ledger again as CSV with a header row, then upload it from the
          Documents screen.
        </p>
      </main>
    );
  }

  const saved = org.settings.spendMapping;
  const usableSaved =
    saved &&
    file.headers.includes(saved.description) &&
    file.headers.includes(saved.amount);

  return (
    <MappingForm
      documentId={doc.id}
      filename={doc.filename}
      headers={file.headers}
      sample={file.sample}
      rowCount={file.rowCount}
      guess={usableSaved ? saved : guessMapping(file.headers)}
      savedNote={Boolean(usableSaved)}
    />
  );
}

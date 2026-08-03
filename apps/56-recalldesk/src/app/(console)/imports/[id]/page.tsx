import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireUser, hasRole } from "@/lib/auth";
import { ScreenHeader } from "@/components/ui";
import { RECIPES } from "@/lib/pms";
import { previewImport } from "@/server/imports";
import { MappingSheet } from "./MappingSheet";
import { commitAction, remapAction, rollbackAction } from "../actions";

export const metadata: Metadata = { title: "Import preview" };
export const dynamic = "force-dynamic";

export default async function ImportPreviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await requireUser();

  let preview;
  try {
    preview = await previewImport({ importId: id, locationIds: ctx.locations.map((l) => l.id) });
  } catch {
    notFound();
  }

  const status = await importStatus(id, ctx.locations.map((l) => l.id));
  const canCommit = preview.problems.length === 0 && preview.patientCount > 0 && hasRole(ctx.user, "office_manager");

  return (
    <main className="screen">
      <ScreenHeader
        label={`${RECIPES[preview.source].name} export`}
        title={status === "committed" ? "Imported" : "Dry run"}
      />

      {!hasRole(ctx.user, "office_manager") && status !== "committed" && (
        <p className="t-secondary" style={{ marginTop: 0, color: "var(--color-amber-text)" }}>
          You can check this dry run, but committing a roster needs office-manager access.
        </p>
      )}

      <MappingSheet
        importId={preview.importId}
        headers={preview.headers}
        mapping={preview.mapping}
        sample={preview.sample}
        counts={{ rows: preview.rowCount, patients: preview.patientCount, visits: preview.visitCount }}
        anomalies={preview.anomalies}
        problems={preview.problems}
        status={status}
        canCommit={canCommit}
        remap={remapAction}
        commit={commitAction}
        rollback={rollbackAction}
      />
    </main>
  );
}

async function importStatus(importId: string, locationIds: string[]): Promise<string> {
  const { getImport } = await import("@/server/imports");
  const found = await getImport(importId, locationIds);
  return found?.row.status ?? "uploaded";
}

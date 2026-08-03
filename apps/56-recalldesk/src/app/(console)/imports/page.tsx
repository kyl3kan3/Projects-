import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { Icon } from "@/components/icons";
import { Pill, ScreenHeader } from "@/components/ui";
import { formatDay } from "@/lib/dates";
import { count } from "@/lib/format";
import { RECIPES } from "@/lib/pms";
import { listImports } from "@/server/imports";
import { RecipePicker } from "./RecipePicker";
import { uploadAction } from "./actions";

export const metadata: Metadata = { title: "Imports" };
export const dynamic = "force-dynamic";

export default async function ImportsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { location } = await requireUser();
  const params = await searchParams;
  const first = params.first === "1";
  const history = await listImports(location.id);

  return (
    <main className="screen">
      <ScreenHeader
        label={first ? "Step 1 of 3" : "Roster"}
        title={first ? "Import your patient list" : "Imports"}
      />

      {first && (
        <p className="t-body" style={{ marginTop: 0, marginBottom: 20 }}>
          Follow the recipe for your system, upload the file, and check the dry run. Your roster is
          not touched until you press <strong>Commit import</strong>.
        </p>
      )}

      <RecipePicker action={uploadAction} />

      {history.length > 0 && (
        <section style={{ marginTop: 32 }}>
          <p className="t-label" style={{ margin: "0 0 4px" }}>
            History
          </p>
          {history.map((row) => (
            <Link key={row.id} href={`/imports/${row.id}`} className="row" style={{ display: "flex" }}>
              <span style={{ color: "var(--color-ink-2)", lineHeight: 0 }}>
                <Icon name="arrow-up-doc" size={18} />
              </span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span className="t-title" style={{ display: "block" }}>
                  {RECIPES[row.source].name} · {count(row.patientCount)} patients
                </span>
                <span className="t-secondary">
                  {count(row.rowCount)} rows · {formatDay(row.createdAt)}
                  {row.anomalies.length > 0 ? ` · ${row.anomalies.length} flagged` : ""}
                </span>
              </span>
              <StatusPill status={row.status} />
            </Link>
          ))}
        </section>
      )}
    </main>
  );
}

function StatusPill({ status }: { status: string }) {
  switch (status) {
    case "committed":
      return <Pill tone="green">Committed</Pill>;
    case "previewed":
      return <Pill tone="amber">Preview</Pill>;
    case "rolled_back":
      return <Pill tone="red">Rolled back</Pill>;
    case "failed":
      return <Pill tone="red">Failed</Pill>;
    default:
      return <Pill tone="quiet">Uploaded</Pill>;
  }
}

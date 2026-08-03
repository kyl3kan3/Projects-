import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { engagementViews, rollup } from "@/lib/verdicts";
import { listProperties } from "@/lib/vendors";
import { IconChevron } from "@/components/icons";
import { NewPropertyForm } from "./NewPropertyForm";

export const metadata: Metadata = { title: "Properties" };

export default async function PropertiesPage() {
  const { org } = await requireUser();
  const [properties, views] = await Promise.all([listProperties(org.id), engagementViews(org)]);

  return (
    <main style={{ padding: "24px var(--gutter) 0" }}>
      <h1 className="t-h2">Properties and projects</h1>
      <p className="t-secondary" style={{ marginTop: 4, maxWidth: "62ch" }}>
        Your units of exposure. Compliance is evaluated per property, because the same roofer can face
        different requirements on different buildings.
      </p>

      <div style={{ marginTop: 20 }}>
        {properties.length === 0 ? (
          <div className="panel" style={{ padding: 20 }}>
            <p className="t-title">No properties yet</p>
            <p className="t-secondary" style={{ marginTop: 8 }}>
              Add the buildings or jobs you hold certificates for. Importing a vendor CSV with a
              Properties column creates them for you.
            </p>
          </div>
        ) : (
          properties.map((property) => {
            const counts = rollup(views.filter((v) => v.property.id === property.id));
            return (
              <Link
                key={property.id}
                href={`/properties/${property.id}`}
                className="row no-underline"
              >
                <span style={{ minWidth: 0, flex: 1 }}>
                  <span className="t-title" style={{ display: "block" }}>
                    {property.name}
                  </span>
                  <span className="t-secondary">
                    {property.kind === "project" ? "Project" : "Property"}
                    {property.address ? ` · ${property.address}` : ""}
                  </span>
                </span>
                <span style={{ textAlign: "right", flex: "none" }}>
                  <span className="t-mono" style={{ display: "block" }}>
                    {counts.compliant + counts.expiring}/{counts.total}
                  </span>
                  <span
                    className="t-label"
                    style={{ color: counts.blocked ? "var(--color-claim)" : "var(--color-dim)" }}
                  >
                    {counts.blocked ? `${counts.blocked} failing` : "all covered"}
                  </span>
                </span>
                <IconChevron size={18} />
              </Link>
            );
          })
        )}
      </div>

      <section style={{ marginTop: 32 }}>
        <details open={properties.length === 0}>
          <summary
            className="btn-quiet"
            style={{ minHeight: 44, display: "flex", alignItems: "center" }}
          >
            Add a property or project
          </summary>
          <NewPropertyForm defaultKind={org.kind === "gc" ? "project" : "property"} />
        </details>
      </section>
    </main>
  );
}

import type { Metadata } from "next";
import { and, asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { crews, employees } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { ScreenHeader } from "@/components/ScreenHeader";
import { IntakeWizard } from "./IntakeWizard";

export const metadata: Metadata = { title: "Log an incident" };

export default async function NewIncidentPage() {
  const { company } = await requireUser();
  const db = getDb();
  const roster = await db
    .select({ id: employees.id, name: employees.name, jobTitle: employees.jobTitle })
    .from(employees)
    .where(and(eq(employees.companyId, company.id), eq(employees.active, true)))
    .orderBy(asc(employees.name));
  const [firstCrew] = await db
    .select({ siteLabel: crews.siteLabel, name: crews.name })
    .from(crews)
    .where(and(eq(crews.companyId, company.id), eq(crews.active, true)))
    .orderBy(asc(crews.name));

  // datetime-local wants a local wall-clock string, not an instant.
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16);

  return (
    <main className="screen">
      <ScreenHeader
        label="Incident intake"
        title="One question at a time"
        back={{ href: "/incidents", label: "Incidents" }}
      />
      <IntakeWizard
        employees={roster}
        defaultSite={firstCrew?.siteLabel ?? firstCrew?.name ?? ""}
        now={local}
      />
    </main>
  );
}

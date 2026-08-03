import type { Metadata } from "next";
import { and, asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { crews, employees } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { PLANS } from "@/lib/plans";
import { ScreenHeader } from "@/components/ScreenHeader";
import { RosterList } from "./RosterList";

export const metadata: Metadata = { title: "Field roster" };

export default async function RosterPage() {
  const { company } = await requireUser();
  const db = getDb();
  const staff = await db
    .select({ employee: employees, crewName: crews.name })
    .from(employees)
    .leftJoin(crews, eq(crews.id, employees.crewId))
    .where(eq(employees.companyId, company.id))
    .orderBy(asc(employees.name));
  const crewOptions = await db
    .select({ id: crews.id, name: crews.name })
    .from(crews)
    .where(and(eq(crews.companyId, company.id), eq(crews.active, true)))
    .orderBy(asc(crews.name));

  const active = staff.filter((s) => s.employee.active).length;
  const limit = PLANS[company.plan].headcount;

  return (
    <main className="screen">
      <ScreenHeader
        label="Field roster"
        title={`${active} of ${limit} field employees`}
        back={{ href: "/settings", label: "Settings" }}
      />
      <p className="t-secondary">
        No logins, no invitations, nothing to install. They sign on the foreman&apos;s phone. Job
        titles matter because that is a column on the OSHA 300 log.
      </p>
      {active >= limit ? (
        <p className="t-secondary mt-3" style={{ color: "var(--color-orange)" }}>
          You are at the {PLANS[company.plan].name} plan&apos;s limit of {limit}. Adding one more
          prompts an upgrade — nothing already recorded is affected.
        </p>
      ) : null}

      <RosterList
        staff={staff.map(({ employee, crewName }) => ({
          id: employee.id,
          name: employee.name,
          jobTitle: employee.jobTitle,
          crewId: employee.crewId,
          crewName,
          hireDate: employee.hireDate,
          active: employee.active,
        }))}
        crews={crewOptions}
      />
    </main>
  );
}

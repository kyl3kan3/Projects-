import type { Metadata } from "next";
import { asc, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { crews, employees } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { dayName } from "@/lib/dates";
import { ScreenHeader } from "@/components/ScreenHeader";
import { CrewList } from "./CrewList";

export const metadata: Metadata = { title: "Crews" };

export default async function CrewsPage() {
  const { company } = await requireUser();
  const db = getDb();
  const rows = await db
    .select()
    .from(crews)
    .where(eq(crews.companyId, company.id))
    .orderBy(asc(crews.name));
  const counts = await db
    .select({ crewId: employees.crewId, n: sql<number>`count(*)::int` })
    .from(employees)
    .where(eq(employees.companyId, company.id))
    .groupBy(employees.crewId);

  const activeCount = rows.filter((c) => c.active).length;

  return (
    <main className="screen">
      <ScreenHeader
        label="Crews and foremen"
        title={`${activeCount} active crew${activeCount === 1 ? "" : "s"}`}
        back={{ href: "/settings", label: "Settings" }}
      />
      <p className="t-secondary">
        A crew is a foreman, a phone number, and a talk day. The Monday link goes to that
        number; the foreman needs no account and installs nothing.
      </p>
      <CrewList
        crews={rows.map((c) => ({
          id: c.id,
          name: c.name,
          siteLabel: c.siteLabel,
          foremanName: c.foremanName,
          foremanPhone: c.foremanPhone,
          foremanEmail: c.foremanEmail,
          talkDayLabel: dayName(c.talkDay),
          active: c.active,
          headcount: counts.find((x) => x.crewId === c.id)?.n ?? 0,
        }))}
        defaultTalkDay={company.settings.talkDay}
      />
    </main>
  );
}

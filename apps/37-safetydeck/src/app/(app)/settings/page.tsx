import type { Metadata } from "next";
import Link from "next/link";
import { and, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { crews, employees } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { PLANS } from "@/lib/plans";
import { dayName, todayIso, year as yearOf } from "@/lib/dates";
import { denominatorsFor } from "@/lib/incident-store";
import { ScreenHeader } from "@/components/ScreenHeader";
import { IconChevronRight } from "@/components/icons";
import { CompanyForm } from "./CompanyForm";
import { SignOutButton } from "./SignOutButton";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const { company, user } = await requireUser();
  const db = getDb();
  const today = todayIso(company.timezone);
  const year = yearOf(today);
  const [{ crewCount }] = await db
    .select({ crewCount: sql<number>`count(*)::int` })
    .from(crews)
    .where(and(eq(crews.companyId, company.id), eq(crews.active, true)));
  const [{ staffCount }] = await db
    .select({ staffCount: sql<number>`count(*)::int` })
    .from(employees)
    .where(and(eq(employees.companyId, company.id), eq(employees.active, true)));
  const denominators = await denominatorsFor(company.id, year);

  return (
    <main className="screen">
      <ScreenHeader label={company.name} title="Settings" />

      <section>
        <Row
          href="/settings/crews"
          title="Crews and foremen"
          detail={`${crewCount} active · talks go out on ${dayName(company.settings.talkDay)}`}
        />
        <Row
          href="/settings/roster"
          title="Field roster"
          detail={`${staffCount} of ${PLANS[company.plan].headcount} on the ${PLANS[company.plan].name} plan`}
        />
        <Row
          href="/settings/billing"
          title="Billing"
          detail={`${PLANS[company.plan].name} · ${company.subscriptionStatus.replace("_", " ")}`}
        />
        <Row
          href={`/incidents?year=${year}`}
          title={`${year} employment numbers`}
          detail={
            denominators.annualAvgEmployees === null || denominators.totalHoursWorked === null
              ? "Not set — the 300A cannot be posted without them"
              : `${denominators.annualAvgEmployees} employees · ${denominators.totalHoursWorked.toLocaleString("en-US")} hours`
          }
        />
      </section>

      <CompanyForm
        company={{
          name: company.name,
          establishmentName: company.establishmentName ?? "",
          streetAddress: company.streetAddress ?? "",
          city: company.city ?? "",
          state: company.state ?? "",
          postalCode: company.postalCode ?? "",
          naicsCode: company.naicsCode ?? "",
          industryDescription: company.industryDescription ?? "",
          timezone: company.timezone,
          talkDay: company.settings.talkDay,
          missedGraceHours: company.settings.missedGraceHours,
          opsEmail: company.settings.opsEmail ?? "",
          opsPhone: company.settings.opsPhone ?? "",
        }}
      />

      <section className="mt-10 rule-t pt-6">
        <p className="t-label">Signed in</p>
        <p className="t-title mt-1">{user.email}</p>
        <p className="t-secondary mt-1">Role: {user.role}</p>
        <div className="mt-4">
          <SignOutButton />
        </div>
      </section>

      <p className="t-secondary mt-10">
        SafetyDeck is recordkeeping software, not legal advice. Recordability decisions come from
        the versioned 29 CFR 1904 logic stamped on every form; the employer remains responsible
        for the accuracy of its records. Federal forms only in v1 — check your state plan where
        it differs.
      </p>
    </main>
  );
}

function Row({ href, title, detail }: { href: string; title: string; detail: string }) {
  return (
    <Link href={href} className="row">
      <span className="min-w-0 flex-1">
        <span className="t-title block">{title}</span>
        <span className="t-secondary block truncate">{detail}</span>
      </span>
      <IconChevronRight size={18} style={{ color: "var(--color-fg-3)" }} />
    </Link>
  );
}

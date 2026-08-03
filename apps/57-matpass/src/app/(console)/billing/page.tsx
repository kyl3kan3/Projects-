import type { Metadata } from "next";
import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { students } from "@/db/schema";
import { Notice, ScreenTitle, SectionHead } from "@/components/ui";
import { requireSchool } from "@/lib/auth";
import { familyBilling, listMembershipPlans } from "@/lib/billing";
import { stripeConfigured } from "@/lib/env";
import { formatMoney } from "@/lib/plans";
import { dayKey, formatDay } from "@/lib/time";
import { BillingScreens } from "./BillingScreens";

export const metadata: Metadata = { title: "Billing" };

export default async function BillingPage() {
  const { school, user } = await requireSchool();
  const db = getDb();

  const [rows, plans, roster] = await Promise.all([
    familyBilling({ schoolId: school.id, timezone: school.timezone }),
    listMembershipPlans(school.id),
    db
      .select({
        id: students.id,
        familyId: students.familyId,
        firstName: students.firstName,
        lastName: students.lastName,
      })
      .from(students)
      .where(eq(students.schoolId, school.id))
      .orderBy(asc(students.firstName)),
  ]);

  const pastDue = rows.filter((r) => r.subscription?.status === "past_due");
  const monthly = rows.reduce(
    (total, row) =>
      row.subscription && row.subscription.status === "active" && row.plan?.interval === "month"
        ? total + (row.amountCents ?? 0)
        : total,
    0,
  );

  return (
    <main className="screen">
      <ScreenTitle
        eyebrow="Tuition on your own Stripe account"
        title="Billing"
        action={
          <Link href="/settings/plan" className="btn-quiet">
            MatPass plan
          </Link>
        }
      />

      <section>
        <p className="t-label">Billed monthly</p>
        <p className="t-stat" style={{ marginTop: 4 }}>
          {formatMoney(monthly)}
        </p>
        <p className="t-secondary" style={{ marginTop: 4 }}>
          {rows.filter((r) => r.subscription?.status === "active").length} active membership
          {rows.filter((r) => r.subscription?.status === "active").length === 1 ? "" : "s"} ·{" "}
          {pastDue.length} past due · lands in your account, not ours
        </p>
      </section>

      {!stripeConfigured() ? (
        <div style={{ marginTop: 20 }}>
          <Notice>
            No Stripe key is configured in this environment, so payment links below are{" "}
            <strong>simulated</strong> and clearly marked as such. Everything else — plans, who a
            membership covers, past-due state, the dunning ladder — is real and stored.
          </Notice>
        </div>
      ) : null}

      {pastDue.length > 0 ? (
        <>
          <SectionHead>Needs a conversation</SectionHead>
          {pastDue.map((row) => (
            <div key={row.family.id} className="card" style={{ padding: 16, marginBottom: 12 }}>
              <p className="t-title">{row.family.name}</p>
              <p className="t-data amber" style={{ marginTop: 6 }}>
                card failed{" "}
                {row.subscription?.pastDueSince
                  ? formatDay(dayKey(row.subscription.pastDueSince, school.timezone))
                  : "recently"}
                {row.daysPastDue !== null ? ` · ${row.daysPastDue} days ago` : ""} · retry link sent
              </p>
              <p className="t-secondary" style={{ marginTop: 6 }}>
                {row.studentNames.join(", ")} — still training. Attendance is never blocked by a card.
              </p>
              {row.subscription && row.subscription.failedPayments >= 2 ? (
                <p className="t-secondary alarm" style={{ marginTop: 6 }}>
                  {row.subscription.failedPayments} failed attempts — escalated to the desk.
                </p>
              ) : null}
            </div>
          ))}
        </>
      ) : null}

      <BillingScreens
        canManage={user.role === "owner"}
        connected={Boolean(school.stripeAccountId)}
        plans={plans.map((p) => ({
          id: p.id,
          name: p.name,
          amountCents: p.amountCents,
          interval: p.interval,
          kind: p.kind,
        }))}
        families={rows.map((row) => ({
          id: row.family.id,
          name: row.family.name,
          email: row.family.email,
          students: roster
            .filter((s) => s.familyId === row.family.id)
            .map((s) => ({ id: s.id, name: `${s.firstName} ${s.lastName}` })),
          subscription: row.subscription
            ? {
                id: row.subscription.id,
                status: row.subscription.status,
                planName: row.plan?.name ?? "",
                amountCents: row.amountCents ?? 0,
                interval: row.plan?.interval ?? "month",
                coveredCount: row.subscription.studentIds.length,
                currentPeriodEnd: row.subscription.currentPeriodEnd
                  ? formatDay(dayKey(row.subscription.currentPeriodEnd, school.timezone))
                  : null,
              }
            : null,
        }))}
      />
    </main>
  );
}

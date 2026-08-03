import type { Metadata } from "next";
import { and, asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { certs, crews, employees } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { certKindLabel, deriveStatus, expiryLabel } from "@/lib/certs";
import { slashDate, todayIso } from "@/lib/dates";
import { objectUrl } from "@/lib/storage";
import { ScreenHeader } from "@/components/ScreenHeader";
import { StatusPill } from "@/components/StatusPill";
import { IconCamera } from "@/components/icons";
import { AddCert } from "./AddCert";
import { DeleteCert } from "./DeleteCert";
import Link from "next/link";

export const metadata: Metadata = { title: "Certs" };

type Filter = "all" | "expiring" | "expired";

export default async function CertsPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const { company } = await requireUser();
  const params = await searchParams;
  const filter = (params.filter as Filter) ?? "all";
  const today = todayIso(company.timezone);
  const db = getDb();

  const rows = await db
    .select({ cert: certs, employee: employees, crewName: crews.name })
    .from(certs)
    .innerJoin(employees, eq(employees.id, certs.employeeId))
    .leftJoin(crews, eq(crews.id, employees.crewId))
    .where(eq(certs.companyId, company.id))
    .orderBy(asc(certs.expiresOn));

  const roster = await db
    .select({ id: employees.id, name: employees.name })
    .from(employees)
    .where(and(eq(employees.companyId, company.id), eq(employees.active, true)))
    .orderBy(asc(employees.name));

  const withStatus = rows.map((r) => ({
    ...r,
    status: deriveStatus(r.cert.expiresOn, today),
  }));
  // Soonest expiry first; no-expiry cards last, since nothing is due on them.
  withStatus.sort((a, b) => {
    if (!a.cert.expiresOn) return 1;
    if (!b.cert.expiresOn) return -1;
    return a.cert.expiresOn.localeCompare(b.cert.expiresOn);
  });

  const counts = {
    all: withStatus.length,
    expiring: withStatus.filter((r) => r.status === "expiring").length,
    expired: withStatus.filter((r) => r.status === "expired").length,
  };
  const visible = filter === "all" ? withStatus : withStatus.filter((r) => r.status === filter);

  return (
    <main className="screen">
      <ScreenHeader label="Training and certifications" title="Cert tracker" settings />

      <p className="t-stat" style={{ color: counts.expired > 0 ? "var(--color-red)" : "var(--color-paper)" }}>
        {counts.expired} <span style={{ fontSize: 20 }}>expired</span>
      </p>
      <p className="t-secondary mt-1">
        {counts.expiring} expiring inside 60 days, {counts.all} card
        {counts.all === 1 ? "" : "s"} on file.{" "}
        {company.settings.opsEmail
          ? `Reminders go to ${company.settings.opsEmail} at 60, 30 and 7 days, and once when a card lapses.`
          : "Add an ops email in Settings and the 60/30/7-day reminders start going out."}
      </p>

      <div className="mt-5 flex gap-2">
        <Link href="/certs" className="chip" data-active={filter === "all"}>
          All {counts.all}
        </Link>
        <Link href="/certs?filter=expiring" className="chip" data-active={filter === "expiring"}>
          Expiring {counts.expiring}
        </Link>
        <Link href="/certs?filter=expired" className="chip" data-active={filter === "expired"}>
          Expired {counts.expired}
        </Link>
      </div>

      <section className="mt-6">
        {visible.map(({ cert, employee, crewName, status }, i) => (
          <div
            key={cert.id}
            className="row row-in flex-wrap"
            style={{
              animationDelay: `${Math.min(i, 8) * 24}ms`,
              borderLeft: status === "expired" ? "2px solid var(--color-red)" : undefined,
              paddingLeft: status === "expired" ? 12 : 0,
            }}
          >
            <span
              className={`dot ${status === "expired" ? "dot-red" : status === "expiring" ? "dot-orange" : "dot-green"}`}
              aria-hidden
            />
            <span className="min-w-0 flex-1">
              <span className="t-title block truncate">{employee.name}</span>
              <span className="t-secondary block truncate">
                {certKindLabel(cert.kind)} · {cert.label}
                {crewName ? ` · ${crewName}` : ""}
              </span>
            </span>
            <span className="shrink-0 text-right">
              <span className="t-data block">
                {cert.expiresOn ? `EXPIRES ${slashDate(cert.expiresOn)}` : "NO EXPIRY"}
              </span>
              <span className="t-secondary block" style={{ fontSize: 11 }}>
                {expiryLabel(cert.expiresOn, today)}
              </span>
            </span>
            {cert.cardPhotoKey ? (
              <a
                href={objectUrl(cert.cardPhotoKey)}
                target="_blank"
                rel="noreferrer"
                aria-label={`Photo of ${employee.name}'s ${certKindLabel(cert.kind)} card`}
                style={{ color: "var(--color-fg-3)" }}
              >
                <IconCamera size={18} />
              </a>
            ) : null}
            <DeleteCert certId={cert.id} label={`${employee.name} — ${certKindLabel(cert.kind)}`} />
          </div>
        ))}
        {visible.length === 0 ? (
          <div className="py-6">
            <p className="t-title">
              {counts.all === 0 ? "No certs on file yet." : "Nothing in that state."}
            </p>
            <p className="t-secondary mt-2">
              {counts.all === 0
                ? "Photograph the card, type the dates, and the ladder takes it from there. OSHA 10 and 30 have no federal expiry; fit tests and first aid do."
                : "That is the good outcome — nothing is lapsing."}
            </p>
          </div>
        ) : null}
      </section>

      {counts.all > 0 ? (
        <p className="t-secondary mt-6">
          Statuses are worked out from today&apos;s date every time this screen loads, so a card
          that lapsed overnight is red this morning.
        </p>
      ) : null}

      <AddCert roster={roster} today={today} />
    </main>
  );
}

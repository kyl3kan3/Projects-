import type { Metadata } from "next";
import Link from "next/link";
import { and, asc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { expiryAlerts } from "@/db/schema";
import { IconExternal, IconFileBadge } from "@/components/icons";
import { AddCredentialForm, RemoveCredentialButton, RenewForm } from "./LicenseForms";
import { requireUser } from "@/lib/auth";
import { CREDENTIAL_LABEL, CREDENTIAL_STATUS_LABEL, credentialStatus } from "@/lib/credentials";
import { longDate, relativeDays, shortDate } from "@/lib/format";
import { expiringPermits, listOrgMembers } from "@/lib/jobs";
import { listCredentials } from "@/lib/licenses";
import { tierLabel } from "@/lib/expiry";

export const metadata: Metadata = { title: "Licences" };

/**
 * One calendar for both halves of the risk surface. Licence tools ignore permits,
 * permit tools ignore licences, and the fine does not care which one lapsed.
 *
 * Status is derived from the date on every render — there is no stored flag here to
 * drift out of date.
 */
export default async function LicensesPage() {
  const { org } = await requireUser();
  const [credentials, permits, members] = await Promise.all([
    listCredentials(org.id),
    expiringPermits(org.id),
    listOrgMembers(org.id),
  ]);

  const db = getDb();
  const scheduled = credentials.length
    ? await db
        .select()
        .from(expiryAlerts)
        .where(
          and(
            eq(expiryAlerts.organizationId, org.id),
            eq(expiryAlerts.subjectType, "license"),
            inArray(
              expiryAlerts.subjectId,
              credentials.map((c) => c.id),
            ),
          ),
        )
        .orderBy(asc(expiryAlerts.scheduledFor))
    : [];

  return (
    <main className="screen pt-6">
      <h1 className="t-h2">Licences and permits</h1>
      <p className="t-secondary mt-2">
        Every paper with a date on it, in one place. Notices go out at 60, 30, 7 and 1 day before
        expiry, and the last two also reach the owner.
      </p>

      <section className="mt-6">
        <h2 className="t-label">Your credentials</h2>
        {credentials.length === 0 ? (
          <p className="t-body mt-2">
            Nothing on file yet. Add your ROC licence first — it is the one that stops permits
            statewide the morning after it lapses.
          </p>
        ) : (
          <ul className="mt-1">
            {credentials.map((credential, index) => {
              const status = credentialStatus(credential.expiresAt);
              const rungs = scheduled.filter((a) => a.subjectId === credential.id);
              const next = rungs.find((a) => a.state === "scheduled");
              const sent = rungs.filter((a) => a.state === "sent");
              return (
                <li
                  key={credential.id}
                  className="row row-in"
                  style={{ animationDelay: `${Math.min(index, 8) * 24}ms` }}
                >
                  <IconFileBadge
                    size={18}
                    style={{
                      color:
                        status === "expired"
                          ? "var(--color-signal-red)"
                          : status === "expiring"
                            ? "var(--color-ochre)"
                            : "var(--color-fg-3)",
                    }}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="t-title block">
                      {CREDENTIAL_LABEL[credential.kind]}{" "}
                      <span className="t-mono">{credential.number}</span>
                    </span>
                    <span className="t-secondary block">
                      {credential.issuingAuthority} · {credential.holder}
                    </span>
                    <span
                      className="t-data mt-1 block"
                      style={{
                        color:
                          status === "expired"
                            ? "var(--color-signal-red)"
                            : status === "expiring"
                              ? "var(--color-ochre)"
                              : "var(--color-fg-3)",
                      }}
                    >
                      {longDate(credential.expiresAt)} — {relativeDays(credential.expiresAt)}
                    </span>
                    <span className="t-secondary mt-1 block">
                      {next
                        ? `Next notice ${tierLabel(next.tier)} on ${shortDate(next.scheduledFor)}`
                        : status === "expired"
                          ? "No further notices — an expired credential repeats in the record, not in your inbox"
                          : "All notices sent"}
                      {sent.length > 0 ? ` · ${sent.length} sent` : ""}
                    </span>
                    <span className="mt-2 flex flex-wrap items-center gap-4">
                      <RenewForm credentialId={credential.id} />
                      <RemoveCredentialButton credentialId={credential.id} />
                      {credential.renewalUrl && (
                        <a
                          href={credential.renewalUrl}
                          target="_blank"
                          rel="noreferrer noopener"
                          className="btn-quiet btn-quiet-sm"
                        >
                          Renewal page
                          <IconExternal size={14} />
                        </a>
                      )}
                    </span>
                  </span>
                  <span
                    className={`pill ${
                      status === "expired"
                        ? "pill-expired"
                        : status === "expiring"
                          ? "pill-pending"
                          : "pill-neutral"
                    } shrink-0`}
                  >
                    <span className="pill-dot" />
                    {CREDENTIAL_STATUS_LABEL[status]}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="mt-8">
        <h2 className="t-label">Issued permits with an expiry</h2>
        {permits.length === 0 ? (
          <p className="t-secondary mt-2">
            No issued permits are on the clock. A permit appears here the moment you record it as
            issued, with the expiry its jurisdiction's own rule produces.
          </p>
        ) : (
          <ul className="mt-1">
            {permits.map((permit) => (
              <li key={permit.applicationId} className="row">
                <span className="min-w-0 flex-1">
                  <Link
                    href={`/jobs/${permit.jobId}`}
                    className="t-title block"
                    style={{ color: "var(--color-fg)" }}
                  >
                    {permit.permitName}
                  </Link>
                  <span className="t-secondary block truncate">{permit.jobLabel}</span>
                </span>
                <span className="t-data shrink-0" style={{ color: "var(--color-fg-3)" }}>
                  {relativeDays(permit.expiresAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <AddCredentialForm members={members.map((m) => ({ id: m.id, name: m.name }))} />
    </main>
  );
}

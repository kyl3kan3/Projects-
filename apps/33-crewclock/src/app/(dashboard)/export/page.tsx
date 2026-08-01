import type { Metadata } from "next";
import Link from "next/link";
import { requireOffice } from "@/lib/auth";
import { IconCheck, IconDownload } from "@/components/icons";
import { formatDecimalHours, formatShortDate, t } from "@/lib/i18n";
import { addDaysToDateKey, localDateKey, payPeriodFor } from "@/lib/time";
import {
  blockingIssues,
  listExports,
  validateBeforeExport,
  type ExportIssue,
} from "@/lib/payroll-export";
import type { ExportFormat } from "@/db/schema";
import { emailExportAction, generateExportAction } from "./actions";

export const metadata: Metadata = { title: "Payroll export" };
export const dynamic = "force-dynamic";

/**
 * The export screen: pick a period and a format, read the preview, generate.
 *
 * The validator runs on every render, not on submit, so the office sees "Miguel
 * has no ADP file number" while there is still time to fix it — rather than
 * finding out from a failed import on payroll day (README Key Risk 6).
 */
export default async function ExportPage({
  searchParams,
}: {
  searchParams: Promise<{
    period?: string;
    format?: string;
    generated?: string;
    blocked?: string;
    emailed?: string;
  }>;
}) {
  const { user, org } = await requireOffice();
  const locale = user.locale;
  const params = await searchParams;
  const now = new Date();

  const format: ExportFormat = params.format === "adp" ? "adp" : "gusto";
  const anchor = params.period ?? localDateKey(now, org.timezone);
  const period = payPeriodFor(anchor, {
    payPeriod: org.payPeriod,
    weekStartsOn: org.weekStartsOn,
  });
  const previous = payPeriodFor(addDaysToDateKey(period.start, -1), {
    payPeriod: org.payPeriod,
    weekStartsOn: org.weekStartsOn,
  });

  const { rows, issues } = await validateBeforeExport(org, format, period.start, period.end);
  const blocking = blockingIssues(issues);
  const warnings = issues.filter((i) => i.severity === "warn");
  const history = await listExports(org.id);
  const generated = params.generated
    ? history.find((h) => h.id === params.generated) ?? null
    : null;

  const totalRegular = rows.reduce((sum, r) => sum + r.regularCentihours, 0);
  const totalOvertime = rows.reduce((sum, r) => sum + r.overtimeCentihours, 0);

  return (
    <main className="screen">
      <header className="pt-8 pb-4">
        <p className="t-label">{t(locale, "export.title")}</p>
        <h1 className="t-h2 mt-2">
          {t(locale, "review.period", {
            start: formatShortDate(period.start, locale),
            end: formatShortDate(period.end, locale),
          })}
        </h1>
        <p className="t-data mt-2" style={{ color: "var(--fg-2)" }}>
          {rows.length === 1
            ? t(locale, "export.rows.one")
            : t(locale, "export.rows.many", { count: rows.length })}{" "}
          ·{" "}
          {t(locale, "export.totals", {
            regular: formatDecimalHours(totalRegular, locale),
            overtime: formatDecimalHours(totalOvertime, locale),
          })}
        </p>
      </header>

      <div className="mb-5 flex flex-wrap gap-2">
        <Link href={`/export?period=${previous.start}&format=${format}`} className="chip">
          ← {formatShortDate(previous.start, locale)}
        </Link>
        <Link
          href={`/export?period=${localDateKey(now, org.timezone)}&format=${format}`}
          className="chip"
        >
          {t(locale, "common.today")}
        </Link>
      </div>

      <section className="mb-6">
        <p className="t-label mb-2">{t(locale, "export.format")}</p>
        <div className="flex gap-2">
          {(["adp", "gusto"] as ExportFormat[]).map((option) => (
            <Link
              key={option}
              href={`/export?period=${period.start}&format=${option}`}
              className="chip"
              data-active={format === option}
            >
              {t(locale, option === "adp" ? "export.format.adp" : "export.format.gusto")}
            </Link>
          ))}
        </div>
      </section>

      {blocking.length > 0 ? (
        <section className="panel mb-6 p-5" style={{ borderLeft: "2px solid var(--bad)" }}>
          <p className="t-title">{t(locale, "export.blocked")}</p>
          <ul className="mt-3 flex flex-col gap-2">
            {blocking.map((issue, index) => (
              <li key={index} className="t-secondary">
                {issueText(issue, locale)}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {warnings.length > 0 ? (
        <section className="panel mb-6 p-5" style={{ borderLeft: "2px solid var(--warn)" }}>
          <ul className="flex flex-col gap-2">
            {warnings.map((issue, index) => (
              <li key={index} className="t-secondary">
                {issueText(issue, locale)}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {rows.length > 0 ? (
        <section className="mb-6">
          <p className="t-label mb-2">{t(locale, "export.preview")}</p>
          <div className="scroll-x">
            <table className="t-data">
              <thead>
                <tr>
                  <th className="t-label">{t(locale, "common.worker")}</th>
                  <th className="t-label">{t(locale, "export.format.adp")} #</th>
                  <th className="t-label">Reg</th>
                  <th className="t-label">O/T</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.userId}>
                    <td style={{ fontFamily: "var(--font-sans)" }}>{row.name}</td>
                    <td>{row.payrollFileNumber ?? "—"}</td>
                    <td>{formatDecimalHours(row.regularCentihours, locale)}</td>
                    <td style={{ color: row.overtimeCentihours > 0 ? "var(--warn)" : undefined }}>
                      {formatDecimalHours(row.overtimeCentihours, locale)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <form action={generateExportAction} className="mb-8">
        <input type="hidden" name="format" value={format} />
        <input type="hidden" name="periodStart" value={period.start} />
        <input type="hidden" name="periodEnd" value={period.end} />
        <button
          className="btn btn-primary btn-full"
          type="submit"
          disabled={blocking.length > 0 || rows.length === 0}
        >
          {t(locale, "export.generate")}
        </button>
      </form>

      {generated ? (
        <section className="panel mb-8 p-5">
          <p className="t-title flex items-center gap-2">
            <span style={{ color: "var(--accent)" }}>
              <IconCheck size={18} />
            </span>
            {generated.format.toUpperCase()} · {generated.rowCount}{" "}
            {generated.rowCount === 1
              ? t(locale, "export.rows.one")
              : t(locale, "export.rows.many", { count: generated.rowCount })}
          </p>
          <p className="t-data mt-2" style={{ color: "var(--fg-3)" }}>
            {t(locale, "export.checksum", { checksum: generated.checksum ?? "—" })}
          </p>
          <a
            className="btn btn-secondary mt-4 inline-flex"
            href={`/api/exports/${generated.id}`}
            download
          >
            <IconDownload size={18} />
            {t(locale, "export.download")}
          </a>

          <form action={emailExportAction} className="mt-5 flex flex-col gap-3">
            <input type="hidden" name="exportId" value={generated.id} />
            <input type="hidden" name="periodStart" value={period.start} />
            <label className="field">
              <span className="t-label">{t(locale, "export.emailBookkeeper")}</span>
              <input
                className="input input-mono"
                name="email"
                type="email"
                required
                placeholder={t(locale, "export.emailPlaceholder")}
              />
            </label>
            <button className="btn-quiet self-start" type="submit">
              {t(locale, "export.emailBookkeeper")} →
            </button>
          </form>
          {params.emailed ? (
            <p className="t-secondary mt-3" role="status" style={{ color: "var(--accent)" }}>
              {t(locale, "export.emailSent", { email: params.emailed })}
            </p>
          ) : null}
        </section>
      ) : null}

      <section className="pb-4">
        <p className="t-label mb-2">{t(locale, "export.history")}</p>
        {history.length === 0 ? (
          <p className="t-secondary">{t(locale, "export.empty")}</p>
        ) : (
          <div>
            {history.map((record) => (
              <a key={record.id} href={`/api/exports/${record.id}`} className="row" download>
                <div className="min-w-0 flex-1">
                  <p className="t-title truncate">
                    {record.format.toUpperCase()} · {formatShortDate(record.periodStart, locale)} –{" "}
                    {formatShortDate(record.periodEnd, locale)}
                  </p>
                  <p className="t-data mt-0.5" style={{ color: "var(--fg-3)" }}>
                    {formatDecimalHours(record.totalCentihours, locale)} h ·{" "}
                    {t(locale, "export.checksum", { checksum: record.checksum ?? "—" })}
                    {record.deliveredTo ? ` · ${record.deliveredTo}` : ""}
                  </p>
                </div>
                <span style={{ color: "var(--fg-3)" }}>
                  <IconDownload size={18} />
                </span>
              </a>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

function issueText(issue: ExportIssue, locale: "en" | "es"): string {
  switch (issue.code) {
    case "missing_file_number":
      return t(locale, "export.issue.missing_file_number", { name: issue.name ?? "—" });
    case "missing_email":
      return t(locale, "export.issue.missing_email", { name: issue.name ?? "—" });
    case "missing_company_code":
      return t(locale, "export.issue.missing_company_code");
    case "unsplittable_name":
      return t(locale, "export.issue.unsplittable_name", { name: issue.name ?? "—" });
    case "open_entry":
      return t(locale, "export.issue.open_entry", { name: issue.name ?? "—" });
    case "unapproved":
      return t(locale, "export.issue.unapproved", { count: issue.count ?? 0 });
    case "no_rows":
      return t(locale, "review.empty");
    case "period_splits_week":
      return t(locale, "export.issue.period_splits_week");
  }
}

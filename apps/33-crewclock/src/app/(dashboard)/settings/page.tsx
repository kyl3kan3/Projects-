import type { Metadata } from "next";
import Link from "next/link";
import { requireOffice } from "@/lib/auth";
import { t } from "@/lib/i18n";
import { saveSettingsAction } from "./actions";

export const metadata: Metadata = { title: "Settings" };
export const dynamic = "force-dynamic";

const TIMEZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Phoenix",
  "America/Los_Angeles",
  "America/Anchorage",
  "Pacific/Honolulu",
];

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const { user, org } = await requireOffice();
  const locale = user.locale;
  const params = await searchParams;

  return (
    <main className="screen">
      <header className="pt-8 pb-5">
        <p className="t-label">{org.name}</p>
        <h1 className="t-h2 mt-2">{t(locale, "settings.title")}</h1>
        <p className="t-secondary mt-2">
          <Link href="/settings/billing" style={{ color: "var(--accent)" }}>
            {t(locale, "billing.title")} →
          </Link>
        </p>
      </header>

      <form action={saveSettingsAction} className="flex max-w-[520px] flex-col gap-4 pb-4">
        <label className="field">
          <span className="t-label">{t(locale, "settings.company")}</span>
          <input className="input" name="name" defaultValue={org.name} required />
        </label>

        <label className="field">
          <span className="t-label">{t(locale, "settings.timezone")}</span>
          <select className="input" name="timezone" defaultValue={org.timezone}>
            {TIMEZONES.map((zone) => (
              <option key={zone} value={zone}>
                {zone.replace("_", " ")}
              </option>
            ))}
          </select>
        </label>

        <div className="flex gap-3">
          <label className="field flex-1">
            <span className="t-label">{t(locale, "settings.weekStart")}</span>
            <select className="input" name="weekStartsOn" defaultValue={org.weekStartsOn}>
              {WEEKDAYS.map((day, index) => (
                <option key={day} value={index}>
                  {day}
                </option>
              ))}
            </select>
          </label>
          <label className="field flex-1">
            <span className="t-label">{t(locale, "settings.payPeriod")}</span>
            <select className="input" name="payPeriod" defaultValue={org.payPeriod}>
              <option value="weekly">{t(locale, "settings.payPeriod.weekly")}</option>
              <option value="biweekly">{t(locale, "settings.payPeriod.biweekly")}</option>
              <option value="semimonthly">{t(locale, "settings.payPeriod.semimonthly")}</option>
            </select>
          </label>
        </div>

        <div className="flex gap-3">
          <label className="field flex-1">
            <span className="t-label">{t(locale, "settings.otThreshold")}</span>
            <input
              className="input input-mono"
              name="otWeeklyThresholdHours"
              inputMode="numeric"
              defaultValue={org.otWeeklyThresholdHours}
            />
          </label>
          <label className="field flex-1">
            <span className="t-label">{t(locale, "settings.maxShift")}</span>
            <input
              className="input input-mono"
              name="maxShiftHours"
              inputMode="numeric"
              defaultValue={org.maxShiftHours}
            />
          </label>
        </div>

        <div className="flex gap-3">
          <label className="field flex-1">
            <span className="t-label">{t(locale, "settings.autoBreak")}</span>
            <input
              className="input input-mono"
              name="autoBreakMinutes"
              inputMode="numeric"
              defaultValue={org.autoBreakMinutes}
            />
          </label>
          <label className="field flex-1">
            <span className="t-label">{t(locale, "settings.autoBreakAfter")}</span>
            <input
              className="input input-mono"
              name="autoBreakAfterHours"
              inputMode="numeric"
              defaultValue={org.autoBreakAfterHours}
            />
          </label>
        </div>

        <label className="field">
          <span className="t-label">{t(locale, "settings.alertEmail")}</span>
          <input
            className="input input-mono"
            name="alertEmail"
            type="email"
            defaultValue={org.alertEmail ?? ""}
            placeholder="dale@hendricksconcrete.com"
          />
        </label>

        <label className="field">
          <span className="t-label">{t(locale, "settings.alertPhone")}</span>
          <input
            className="input input-mono"
            name="alertPhone"
            defaultValue={org.alertPhone ?? ""}
            placeholder="+1 512 555 0134"
          />
        </label>

        <label className="flex items-center gap-3">
          <input
            type="checkbox"
            name="smsAlertsEnabled"
            defaultChecked={org.smsAlertsEnabled}
            style={{ width: 20, height: 20, accentColor: "var(--accent)" }}
          />
          <span className="t-body">{t(locale, "settings.smsEnabled")}</span>
        </label>

        <label className="field">
          <span className="t-label">{t(locale, "settings.adpCode")}</span>
          <input
            className="input input-mono"
            name="adpCompanyCode"
            defaultValue={org.adpCompanyCode ?? ""}
            placeholder="H4K"
          />
        </label>

        <label className="field">
          <span className="t-label">{t(locale, "settings.defaultLocale")}</span>
          <select className="input" name="defaultLocale" defaultValue={org.defaultLocale}>
            <option value="en">English</option>
            <option value="es">Español</option>
          </select>
        </label>

        {params.error === "timezone" ? (
          <p className="t-secondary" role="alert" style={{ color: "var(--bad)" }}>
            {t(locale, "error.generic")}
          </p>
        ) : null}
        {params.saved ? (
          <p className="t-secondary" role="status" style={{ color: "var(--accent)" }}>
            {t(locale, "settings.saved")}
          </p>
        ) : null}

        <button className="btn btn-primary btn-full mt-2" type="submit">
          {t(locale, "common.save")}
        </button>
      </form>
    </main>
  );
}

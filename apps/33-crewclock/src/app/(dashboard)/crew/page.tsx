import type { Metadata } from "next";
import { asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { requireOffice } from "@/lib/auth";
import { IconPlus } from "@/components/icons";
import { formatMoney, t } from "@/lib/i18n";
import { planSpec } from "@/lib/plans";
import { addCrewAction, setCrewActiveAction } from "./actions";

export const metadata: Metadata = { title: "Crew" };
export const dynamic = "force-dynamic";

export default async function CrewPage({
  searchParams,
}: {
  searchParams: Promise<{ added?: string; error?: string }>;
}) {
  const { user, org } = await requireOffice();
  const locale = user.locale;
  const params = await searchParams;

  const db = getDb();
  const members = await db
    .select()
    .from(users)
    .where(eq(users.organizationId, org.id))
    .orderBy(asc(users.name));
  const activeCount = members.filter((m) => m.active).length;

  return (
    <main className="screen">
      <header className="pt-8 pb-5">
        <p className="t-label">{org.name}</p>
        <h1 className="t-h2 mt-2">{t(locale, "crew.title")}</h1>
        <p className="t-secondary mt-1">
          {t(locale, "crew.seatNote", { count: activeCount, plan: planSpec(org.plan).name })}
        </p>
      </header>

      {params.added ? (
        <section className="panel mb-5 p-5">
          <p className="t-title">{t(locale, "crew.inviteCode", { code: params.added })}</p>
          <p className="t-data mt-2" style={{ fontSize: 24, letterSpacing: "0.18em" }}>
            {params.added}
          </p>
          <p className="t-secondary mt-2">
            {t(locale, "crew.inviteHelp", {
              name: members.find((m) => m.crewCode === params.added)?.name ?? "",
            })}
          </p>
        </section>
      ) : null}

      {params.error === "email" ? (
        <p className="t-secondary mb-4" role="alert" style={{ color: "var(--bad)" }}>
          That email already belongs to another account.
        </p>
      ) : null}
      {params.error === "self" ? (
        <p className="t-secondary mb-4" role="alert" style={{ color: "var(--bad)" }}>
          You cannot deactivate your own account.
        </p>
      ) : null}

      {members.length <= 1 ? (
        <section className="panel mb-6 p-5">
          <p className="t-title">{t(locale, "crew.empty")}</p>
          <p className="t-secondary mt-2">{t(locale, "crew.emptyHelp")}</p>
        </section>
      ) : null}

      <section className="stagger mb-8">
        {members.map((member) => (
          <div key={member.id} className="row items-start">
            <div className="min-w-0 flex-1">
              <p className="t-title truncate">
                {member.name}
                {member.locale === "es" ? " · ES" : ""}
              </p>
              <p className="t-secondary mt-0.5">
                {t(locale, `crew.role.${member.role}` as "crew.role.crew")} ·{" "}
                {formatMoney(member.hourlyCostCents, locale, true)}/h
                {member.payrollFileNumber ? ` · #${member.payrollFileNumber}` : ""}
              </p>
              <p className="t-data mt-1" style={{ color: "var(--fg-3)" }}>
                {member.claimedAt
                  ? t(locale, "crew.inviteCode", { code: member.crewCode ?? "—" })
                  : `${t(locale, "crew.notClaimed")} · ${member.crewCode ?? "—"}`}
              </p>
            </div>
            <form action={setCrewActiveAction} className="shrink-0">
              <input type="hidden" name="userId" value={member.id} />
              <input type="hidden" name="active" value={member.active ? "0" : "1"} />
              <button className="chip" type="submit">
                {member.active ? t(locale, "crew.deactivate") : t(locale, "crew.reactivate")}
              </button>
            </form>
          </div>
        ))}
      </section>

      <form action={addCrewAction} className="flex max-w-[520px] flex-col gap-4">
        <p className="t-label">{t(locale, "crew.add")}</p>
        <label className="field">
          <span className="t-label">{t(locale, "crew.form.name")}</span>
          <input className="input" name="name" required placeholder="Miguel Ángel Ríos Vega" />
        </label>
        <div className="flex gap-3">
          <label className="field flex-1">
            <span className="t-label">{t(locale, "crew.form.rate")}</span>
            <input
              className="input input-mono"
              name="rate"
              inputMode="decimal"
              placeholder="28.00"
            />
          </label>
          <label className="field flex-1">
            <span className="t-label">{t(locale, "crew.form.locale")}</span>
            <select className="input" name="locale" defaultValue={org.defaultLocale}>
              <option value="en">English</option>
              <option value="es">Español</option>
            </select>
          </label>
        </div>
        <p className="t-secondary">{t(locale, "crew.form.rateHelp")}</p>
        <div className="flex gap-3">
          <label className="field flex-1">
            <span className="t-label">{t(locale, "crew.form.role")}</span>
            <select className="input" name="role" defaultValue="crew">
              <option value="crew">{t(locale, "crew.role.crew")}</option>
              <option value="office">{t(locale, "crew.role.office")}</option>
              <option value="owner">{t(locale, "crew.role.owner")}</option>
            </select>
          </label>
          <label className="field flex-1">
            <span className="t-label">{t(locale, "crew.form.fileNumber")}</span>
            <input className="input input-mono" name="payrollFileNumber" placeholder="1042" />
          </label>
        </div>
        <label className="field">
          <span className="t-label">{t(locale, "crew.form.otRule")}</span>
          <select className="input" name="overtimeRule" defaultValue="weekly_40">
            <option value="weekly_40">{t(locale, "crew.otRule.weekly_40")}</option>
            <option value="daily_8_weekly_40">{t(locale, "crew.otRule.daily_8_weekly_40")}</option>
            <option value="none">{t(locale, "crew.otRule.none")}</option>
          </select>
        </label>
        <div className="flex gap-3">
          <label className="field flex-1">
            <span className="t-label">{t(locale, "crew.form.email")}</span>
            <input
              className="input input-mono"
              name="email"
              type="email"
              placeholder="miguel@example.com"
            />
          </label>
          <label className="field flex-1">
            <span className="t-label">{t(locale, "crew.form.phone")}</span>
            <input className="input input-mono" name="phone" placeholder="+1 512 555 0134" />
          </label>
        </div>
        <button className="btn btn-primary btn-full" type="submit">
          <IconPlus size={18} />
          {t(locale, "crew.form.submit")}
        </button>
      </form>
    </main>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { requireCrew, isOffice } from "@/lib/auth";
import { t } from "@/lib/i18n";
import { changePinAction, setLocaleAction, signOutAction } from "./actions";

export const metadata: Metadata = { title: "Profile" };
export const dynamic = "force-dynamic";

/**
 * The crew profile. Three things live here and nothing else: the language pill
 * pair (never buried in settings — DESIGN.md), the PIN, and a plain-language
 * statement of exactly what the app does with location.
 */
export default async function ProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; saved?: string }>;
}) {
  const { user, org } = await requireCrew();
  const locale = user.locale;
  const params = await searchParams;

  const pinError =
    params.error === "mismatch"
      ? t(locale, "join.error.pinMismatch")
      : params.error === "format"
        ? t(locale, "join.error.pinFormat")
        : null;

  return (
    <main className="screen screen-crew">
      <header className="pt-6 pb-5">
        <p className="t-label">{t(locale, "profile.title")}</p>
        <h1 className="t-h2 mt-1">{user.name}</h1>
        <p className="t-secondary mt-1">
          {t(locale, "profile.company")}: {org.name}
        </p>
      </header>

      <section className="hairline-t flex items-center justify-between py-5">
        <div>
          <p className="t-title">{t(locale, "common.language")}</p>
          <p className="t-secondary mt-0.5">{locale === "es" ? "Español" : "English"}</p>
        </div>
        <form action={setLocaleAction} className="lang-pill">
          <button type="submit" name="locale" value="en" data-active={locale === "en"}>
            EN
          </button>
          <button type="submit" name="locale" value="es" data-active={locale === "es"}>
            ES
          </button>
        </form>
      </section>

      {user.crewCode ? (
        <section className="hairline-t flex items-center justify-between py-5">
          <p className="t-title">{t(locale, "profile.crewCode")}</p>
          <span className="t-data-lg" style={{ letterSpacing: "0.12em" }}>
            {user.crewCode}
          </span>
        </section>
      ) : null}

      <section className="hairline-t py-5">
        <p className="t-title">{t(locale, "profile.changePin")}</p>
        <form action={changePinAction} className="mt-3 flex flex-col gap-3">
          <label className="field">
            <span className="t-label">{t(locale, "join.pinLabel")}</span>
            <input
              className="input input-pin"
              name="pin"
              inputMode="numeric"
              autoComplete="off"
              pattern="[0-9]{4}"
              maxLength={4}
              required
            />
          </label>
          <label className="field">
            <span className="t-label">{t(locale, "join.pinConfirmLabel")}</span>
            <input
              className="input input-pin"
              name="pinConfirm"
              inputMode="numeric"
              autoComplete="off"
              pattern="[0-9]{4}"
              maxLength={4}
              required
            />
          </label>
          {pinError ? (
            <p className="t-secondary" role="alert" style={{ color: "var(--bad)" }}>
              {pinError}
            </p>
          ) : null}
          {params.saved ? (
            <p className="t-secondary" role="status" style={{ color: "var(--accent)" }}>
              {t(locale, "settings.saved")}
            </p>
          ) : null}
          <button className="btn btn-primary btn-full" type="submit">
            {t(locale, "common.save")}
          </button>
        </form>
      </section>

      <section className="panel mt-6 p-5">
        <p className="t-title">{t(locale, "profile.privacy.title")}</p>
        <p className="t-secondary mt-2">{t(locale, "profile.privacy.body")}</p>
      </section>

      {isOffice(user.role) ? (
        <p className="mt-6">
          <Link href="/jobs" className="btn-quiet" style={{ textDecoration: "none" }}>
            {t(locale, "nav.jobs")} →
          </Link>
        </p>
      ) : null}

      <form action={signOutAction} className="mt-6 pb-4">
        <button className="btn btn-secondary btn-full" type="submit">
          {t(locale, "common.signOut")}
        </button>
      </form>
    </main>
  );
}

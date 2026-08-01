import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { t } from "@/lib/i18n";
import type { Locale } from "@/db/schema";
import { JoinForm, type JoinStrings } from "./JoinForm";

export const metadata: Metadata = { title: "Join your crew" };

function bundle(locale: Locale): JoinStrings {
  return {
    title: t(locale, "join.title"),
    subtitle: t(locale, "join.subtitle"),
    codeLabel: t(locale, "join.codeLabel"),
    codePlaceholder: t(locale, "join.codePlaceholder"),
    continue: t(locale, "join.continue"),
    setPinTitle: t(locale, "join.setPin.title"),
    setPinSubtitle: t(locale, "join.setPin.subtitle"),
    pinLabel: t(locale, "join.pinLabel"),
    pinConfirmLabel: t(locale, "join.pinConfirmLabel"),
    setPinSubmit: t(locale, "join.setPin.submit"),
    enterPinTitle: t(locale, "join.enterPin.title"),
    enterPinSubmit: t(locale, "join.enterPin.submit"),
    greeting: t(locale, "join.greeting"),
  };
}

export default async function JoinPage({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string }>;
}) {
  const session = await getSession();
  if (session) redirect(session.role === "crew" ? "/clock" : "/jobs");
  const params = await searchParams;

  return (
    <main className="screen mx-auto flex min-h-dvh max-w-[420px] flex-col justify-center pb-0">
      <JoinForm
        strings={{ en: bundle("en"), es: bundle("es") }}
        defaultLocale={params.lang === "es" ? "es" : "en"}
      />
      <p className="t-secondary mt-10 text-center">
        <Link href="/login" style={{ color: "var(--fg-2)" }}>
          Owner or office sign-in · Acceso para dueño u oficina
        </Link>
      </p>
    </main>
  );
}

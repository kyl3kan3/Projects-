import type { Metadata } from "next";
import { RegisterForm } from "./RegisterForm";
import { registerAction, quoteAction } from "./actions";
import { env } from "@/lib/env";
import { formatMoney } from "@/lib/money";
import { getPublicSeason } from "@/lib/registration";
import { formatIso } from "@/lib/time";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ season: string }>;
}): Promise<Metadata> {
  const { season } = await params;
  const view = await getPublicSeason(season);
  if (!view) return { title: "Registration" };
  return {
    title: `${view.season.name} registration · ${view.club.name}`,
    description: `Register a child for ${view.season.name} at ${view.club.name}. About five minutes on a phone.`,
    robots: { index: false, follow: false },
  };
}

/**
 * The public registration page — the link the club posts everywhere.
 *
 * Daylight theme, because a parent opens this outdoors at 2pm in a car park.
 * Nothing here requires an account, and nothing here can reveal another family's
 * data: it reads a season by slug and writes through one action.
 */
export default async function RegisterPage({
  params,
}: {
  params: Promise<{ season: string }>;
}) {
  const { season: slug } = await params;
  const view = await getPublicSeason(slug);

  if (!view) {
    return (
      <main className="world-day screen-narrow min-h-dvh">
        <div className="pt-12">
          <p className="t-label">RosterRally</p>
          <h1 className="t-h2 mt-2">That registration link is not valid</h1>
          <p className="t-secondary mt-2">
            Check the link your club sent, or ask them for a new one. Nothing has been charged.
          </p>
        </div>
      </main>
    );
  }

  const { season, club, divisions } = view;

  if (!view.open) {
    return (
      <main className="world-day screen-narrow min-h-dvh">
        <div className="pt-12">
          <p className="t-label">{club.name}</p>
          <h1 className="t-h2 mt-2">{season.name}</h1>
          <p className="t-body mt-4">{view.closedReason}</p>
          <p className="t-secondary mt-4">
            Registration runs {formatIso(season.registrationOpensOn)} to{" "}
            {formatIso(season.registrationClosesOn)}. If that looks wrong, contact the club
            registrar
            {club.settings?.replyToEmail ? ` at ${club.settings.replyToEmail}` : ""}.
          </p>
          <div className="mt-8">
            <p className="t-label">The age groups this season</p>
            {divisions.map((d) => (
              <div key={d.id} className="row">
                <span className="t-title flex-1">{d.name}</span>
                <span className="t-data">{formatMoney(d.feeCents)}</span>
              </div>
            ))}
          </div>
        </div>
      </main>
    );
  }

  const openDivisions = divisions.filter((d) => !d.full || d.waitlistEnabled);

  return (
    <main className="world-day screen-narrow min-h-dvh">
      <header className="pt-10 pb-6">
        <p className="t-label">{club.name}</p>
        <h1 className="t-h2 mt-2">{season.name} registration</h1>
        <p className="t-secondary mt-2">
          About five minutes. You need a birthdate for each child and a card — or a code, if the club
          gave you one. There is no app to install, and the link we email you is the only thing you
          will need again.
        </p>
      </header>

      {openDivisions.length === 0 ? (
        <p className="t-body">
          Every age group is full and the club has not opened a waitlist. Contact the registrar
          {club.settings?.replyToEmail ? ` at ${club.settings.replyToEmail}` : ""}.
        </p>
      ) : (
        <RegisterForm
          action={registerAction}
          quote={quoteAction}
          slug={slug}
          clubName={club.name}
          divisions={openDivisions.map((d) => ({
            id: d.id,
            name: d.name,
            feeCents: d.feeCents,
            spotsLeft: d.spotsLeft,
            full: d.full,
            waitlistEnabled: d.waitlistEnabled,
            waitlistCount: d.waitlistCount,
            earlyBirdEndsOn: d.earlyBird?.endsOn ?? null,
            earlyBirdOffCents: d.earlyBird?.flatCents ?? 0,
          }))}
          waiverText={season.settings.waiverText}
          siblingPercent={season.settings.siblingDiscountBps / 100}
          installments={{
            enabled: season.settings.installmentsEnabled,
            depositCents: season.settings.depositCents,
            count: season.settings.installmentCount,
          }}
          absorbPlatformFee={season.settings.absorbPlatformFee}
          platformFeeCents={club.plan === "flat" ? 0 : env.applicationFeeCents}
        />
      )}
    </main>
  );
}

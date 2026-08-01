import type { Metadata } from "next";
import Link from "next/link";
import {
  DeleteDivisionForm,
  DivisionForm,
  SeasonSettingsForm,
} from "../SeasonForms";
import {
  deleteDivisionAction,
  saveSeasonSettingsAction,
  upsertDivisionAction,
} from "../actions";
import { EmptyState, ScreenTitle, SectionHead } from "@/components/ui";
import { requireUser, can } from "@/lib/auth";
import { divisionAvailability, getCurrentSeason } from "@/lib/registration";
import { formatMoney } from "@/lib/money";
import { formatIso } from "@/lib/time";

export const metadata: Metadata = { title: "Season setup" };

export default async function SeasonSetupPage() {
  const { club, user } = await requireUser();
  const season = await getCurrentSeason(club.id);

  if (!season) {
    return (
      <main className="screen">
        <ScreenTitle eyebrow="Setup" title="No season yet" />
        <EmptyState
          title="Create a season first"
          body="Divisions, fees and discounts belong to a season, so there has to be one before you can set them up."
          action={
            <Link href="/season" className="btn btn-secondary">
              Back to the season screen
            </Link>
          }
        />
      </main>
    );
  }

  if (!can(user.role, "manage_season")) {
    return (
      <main className="screen">
        <ScreenTitle eyebrow="Setup" title={season.name} />
        <EmptyState
          title="Only a registrar or admin can change season setup"
          body={`Your role here is ${user.role}. Ask a club admin if fees or divisions need changing.`}
        />
      </main>
    );
  }

  const divisions = await divisionAvailability(season.id);

  return (
    <main className="screen">
      <ScreenTitle eyebrow={`${club.name} · ${season.status}`} title={`${season.name} setup`} />
      <p className="t-secondary">
        Registration window {formatIso(season.registrationOpensOn)} –{" "}
        {formatIso(season.registrationClosesOn)} · plays{" "}
        {formatIso(season.startsOn)} – {formatIso(season.endsOn)}.
      </p>

      <SectionHead>Divisions</SectionHead>
      {divisions.length === 0 ? (
        <p className="t-secondary py-2">
          None yet. A division is an age group with its own fee and capacity — U8 Girls, U10 Boys.
        </p>
      ) : (
        <div className="stagger">
          {divisions.map((division) => (
            <div key={division.id} className="row">
              <span className="min-w-0 flex-1">
                <span className="t-title block">{division.name}</span>
                <span className="t-data mt-1 block" style={{ color: "var(--fg-2)" }}>
                  {formatMoney(division.feeCents)} · {division.activeCount}/{division.capacity}
                  {division.earlyBird?.flatCents
                    ? ` · early bird −${formatMoney(division.earlyBird.flatCents)}`
                    : ""}
                  {division.waitlistEnabled ? " · waitlist on" : " · no waitlist"}
                </span>
              </span>
              {division.activeCount === 0 && division.waitlistCount === 0 ? (
                <DeleteDivisionForm
                  action={deleteDivisionAction}
                  seasonId={season.id}
                  divisionId={division.id}
                />
              ) : null}
            </div>
          ))}
        </div>
      )}

      {divisions.map((division) => (
        <DivisionForm
          key={division.id}
          action={upsertDivisionAction}
          seasonId={season.id}
          division={{
            id: division.id,
            name: division.name,
            capacity: division.capacity,
            feeCents: division.feeCents,
            birthYearFrom: division.birthYearFrom,
            birthYearTo: division.birthYearTo,
            earlyBird: division.earlyBird
              ? { endsOn: division.earlyBird.endsOn, flatCents: division.earlyBird.flatCents }
              : null,
            waitlistEnabled: division.waitlistEnabled,
          }}
        />
      ))}
      <DivisionForm action={upsertDivisionAction} seasonId={season.id} />

      <SectionHead>Discounts, plans and the waiver</SectionHead>
      <SeasonSettingsForm
        action={saveSeasonSettingsAction}
        seasonId={season.id}
        settings={season.settings}
      />
    </main>
  );
}

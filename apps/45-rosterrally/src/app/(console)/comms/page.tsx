import type { Metadata } from "next";
import Link from "next/link";
import { ComposeForm, type AudienceCounts } from "./ComposeForm";
import { sendAnnouncementAction } from "./actions";
import { EmptyState, ScreenTitle, SectionHead } from "@/components/ui";
import { IconChevronRight, IconEye } from "@/components/icons";
import { isTeamScoped, requireUser } from "@/lib/auth";
import { listAnnouncements, previewAudience, smsHeadroom } from "@/lib/comms";
import { divisionAvailability, getCurrentSeason } from "@/lib/registration";
import { listTeams, myTeamIds } from "@/lib/rosters";

export const metadata: Metadata = { title: "Comms" };

export default async function CommsPage() {
  const { club, user, settings } = await requireUser();
  const season = await getCurrentSeason(club.id);

  if (!season) {
    return (
      <main className="screen">
        <ScreenTitle eyebrow="Comms" title="No season yet" />
        <EmptyState
          title="An audience comes from registrations"
          body="Open a season and take a registration or two, then you can message the club, a division or one team."
          action={
            <Link href="/season" className="btn btn-secondary">
              Open a season
            </Link>
          }
        />
      </main>
    );
  }

  const coachOnly = isTeamScoped(user.role);
  const divisions = await divisionAvailability(season.id);
  const mine = coachOnly ? await myTeamIds(user.id) : [];
  const teams = (await listTeams(season.id)).filter((t) => !coachOnly || mine.includes(t.team.id));

  // Recipient counts are resolved on the server, once, and handed to the client
  // composer — nothing about the audience is computed in the browser.
  const clubPreview = await previewAudience(club.id, season.id, { kind: "club" }, ["email", "sms"]);
  const divisionPreviews = await Promise.all(
    divisions.map(async (d) => {
      const p = await previewAudience(
        club.id,
        season.id,
        { kind: "division", divisionIds: [d.id] },
        ["email", "sms"],
      );
      return { id: d.id, name: d.name, total: p.total, sms: p.smsCount };
    }),
  );
  const teamPreviews = await Promise.all(
    teams.map(async (t) => {
      const p = await previewAudience(
        club.id,
        season.id,
        { kind: "team", teamIds: [t.team.id] },
        ["email", "sms"],
      );
      return {
        id: t.team.id,
        name: t.team.name,
        divisionName: t.divisionName,
        total: p.total,
        sms: p.smsCount,
      };
    }),
  );

  const counts: AudienceCounts = {
    club: { total: clubPreview.total, sms: clubPreview.smsCount },
    divisions: divisionPreviews,
    teams: teamPreviews,
  };

  const sent = await listAnnouncements(club.id);
  const headroom = await smsHeadroom(club.id, settings.smsMonthlyBudget);

  return (
    <main className="screen">
      <ScreenTitle
        eyebrow={`${club.name} · ${season.name}`}
        title="Comms"
        action={
          <span className="t-data" style={{ color: "var(--fg-2)" }}>
            {headroom} SMS LEFT
          </span>
        }
      />

      <ComposeForm action={sendAnnouncementAction} counts={counts} coachOnly={coachOnly} />

      <SectionHead>Sent</SectionHead>
      {sent.length === 0 ? (
        <p className="t-secondary py-2">
          Nothing sent yet. Every message you send is archived here with who opened it, and every
          family can see their own copy on their page — which is the end of &ldquo;I never got
          it&rdquo;.
        </p>
      ) : (
        <div className="stagger">
          {sent.map((row) => (
            <Link
              key={row.announcement.id}
              href={`/comms/${row.announcement.id}`}
              className="row"
            >
              <span className="min-w-0 flex-1">
                <span className="t-title block truncate">{row.announcement.subject}</span>
                <span className="t-secondary block truncate" style={{ color: "var(--fg-3)" }}>
                  {row.announcement.audienceLabel} ·{" "}
                  {row.announcement.sentAt?.toISOString().slice(0, 10) ?? "draft"}
                  {row.announcement.purpose !== "announcement"
                    ? ` · ${row.announcement.purpose.replace(/_/g, " ")}`
                    : ""}
                </span>
              </span>
              <span
                className="t-data flex items-center gap-1"
                style={{ color: row.reached > 0 ? "var(--accent)" : "var(--fg-3)" }}
              >
                <IconEye size={14} />
                {row.reached}/{row.total}
              </span>
              <IconChevronRight size={18} style={{ color: "var(--fg-3)" }} />
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}

import type { Metadata } from "next";
import { ClaimForm, PayForm, ReleaseForm } from "./FamilyForms";
import { claimSlotAction, payBalanceAction, releaseClaimAction } from "./actions";
import { IconCalendarGrid, IconCheck, IconEye, IconMapPin } from "@/components/icons";
import { getFamilyPage } from "@/lib/family";
import { resolveHouseholdLink } from "@/lib/links";
import { stateLabel } from "@/lib/ledger";
import { formatMoney } from "@/lib/money";
import { env } from "@/lib/env";
import { formatIso } from "@/lib/time";

export const metadata: Metadata = {
  title: "Your family page",
  robots: { index: false, follow: false, nocache: true },
};

/**
 * The family page — the whole no-app story in one screen: schedule, messages,
 * money and volunteer slots, behind a signed link with no password.
 *
 * Daylight theme. Every piece of data on it belongs to this family: the page
 * resolves the token, then hands the household id to `getFamilyPage`, which is the
 * only read surface for it and never takes an id from the request.
 */
export default async function FamilyPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const resolved = await resolveHouseholdLink(token);

  if (!resolved.ok) {
    return (
      <main className="world-day screen-narrow min-h-dvh">
        <div className="pt-12">
          <p className="t-label">RosterRally</p>
          <h1 className="t-h2 mt-2">
            {resolved.reason === "expired" ? "That link has expired" : "That link is not valid"}
          </h1>
          <p className="t-body mt-4">
            {resolved.reason === "revoked"
              ? "Your club replaced the links for your family — ask them to send the new one."
              : "Ask your club registrar to send you a fresh link. Nothing is lost; the link is just a key."}
          </p>
        </div>
      </main>
    );
  }

  const page = await getFamilyPage(resolved.household.id);
  if (!page) {
    return (
      <main className="world-day screen-narrow min-h-dvh">
        <div className="pt-12">
          <h1 className="t-h2">Nothing on file yet</h1>
          <p className="t-body mt-3">
            Once a registration goes through, this page fills in with the schedule, your messages and
            the volunteer slots.
          </p>
        </div>
      </main>
    );
  }

  const upcoming = page.games.filter((g) => !g.canceled).slice(0, 12);

  return (
    <main className="world-day screen-narrow min-h-dvh">
      <header className="pt-10 pb-4">
        <p className="t-label">{page.club.name}</p>
        <h1 className="t-h2 mt-2">{page.household.contactName}</h1>
        <p className="t-secondary mt-1">
          {page.seasonName}
          {page.household.smsConsent ? " · texts on" : " · email only"}
        </p>
      </header>

      {/* Money first: it is the thing a parent came here to check. */}
      <section className="panel p-4">
        <div className="flex items-baseline justify-between">
          <span className="t-label">Still to pay</span>
          <span
            className="t-data-lg"
            style={{ color: page.money.netDueCents > 0 ? "var(--warn)" : "var(--accent)" }}
          >
            {formatMoney(page.money.netDueCents)}
          </span>
        </div>
        {page.money.creditCents > 0 ? (
          <p className="t-secondary mt-2 turf">
            You are {formatMoney(page.money.creditCents)} in credit. It is already counted above, and
            it goes against your next registration automatically.
          </p>
        ) : null}
        {page.money.netDueCents > 0 ? (
          <div className="mt-4">
            <PayForm
              action={payBalanceAction}
              token={token}
              netDueCents={page.money.netDueCents}
            />
          </div>
        ) : (
          <p className="t-secondary mt-2 flex items-center gap-2 turf">
            <IconCheck size={16} /> Nothing outstanding. Thank you.
          </p>
        )}
      </section>

      <h2 className="t-label mt-8">Your children</h2>
      {page.children.map((child) => (
        <div key={child.playerId} className="row">
          <span className="min-w-0 flex-1">
            <span className="t-title block">
              {child.firstName} {child.lastName}
            </span>
            <span className="t-secondary block" style={{ color: "var(--fg-3)" }}>
              {child.divisionName}
              {child.teamName ? ` · ${child.teamName}` : " · team to be assigned"}
              {child.jerseyNumber ? ` · #${child.jerseyNumber}` : ""}
              {child.waitlistPosition ? ` · waitlist #${child.waitlistPosition}` : ""}
            </span>
            {child.medicalNotes ? (
              <span className="t-secondary block" style={{ color: "var(--fg-2)" }}>
                On file: {child.medicalNotes}
              </span>
            ) : null}
            {child.emergencyContacts.length > 0 ? (
              <span className="t-secondary block" style={{ color: "var(--fg-3)" }}>
                Emergency: {child.emergencyContacts.map((c) => `${c.name} ${c.phone}`).join(", ")}
              </span>
            ) : null}
          </span>
          <span className="flex flex-col items-end gap-1">
            <span
              className="pill"
              style={{
                color:
                  child.state === "paid"
                    ? "var(--accent)"
                    : child.state === "unpaid"
                      ? "var(--bad)"
                      : "var(--warn)",
              }}
            >
              {stateLabel(child.state)}
            </span>
            {child.balanceCents > 0 ? (
              <span className="t-data">{formatMoney(child.balanceCents)}</span>
            ) : null}
          </span>
        </div>
      ))}

      <h2 className="t-label mt-8">What is coming</h2>
      {upcoming.length === 0 ? (
        <p className="t-secondary py-2">
          The schedule is not published yet. When it is, it appears here and you get an email — plus a
          reminder the day before every game.
        </p>
      ) : (
        <div className="stagger">
          {upcoming.map((game) => (
            <div key={game.gameId} className="row">
              <span className="t-data" style={{ width: 56 }}>
                {game.time}
              </span>
              <span className="min-w-0 flex-1">
                <span className="t-title block truncate">{game.matchup}</span>
                <span
                  className="t-secondary flex items-center gap-1"
                  style={{ color: "var(--fg-3)" }}
                >
                  <IconMapPin size={14} />
                  {game.where}
                  {game.childNames.length > 0 ? ` · ${game.childNames.join(", ")}` : ""}
                </span>
                {game.note ? (
                  <span className="t-secondary block" style={{ color: "var(--fg-2)" }}>
                    {game.note}
                  </span>
                ) : null}
              </span>
              <span className="t-data" style={{ color: "var(--fg-3)" }}>
                {game.day}
              </span>
            </div>
          ))}
        </div>
      )}

      {page.teams.length > 0 ? (
        <>
          <h2 className="t-label mt-8">Add it to your calendar</h2>
          {page.teams.map((team) => (
            <div key={team.teamId} className="row">
              <IconCalendarGrid size={18} style={{ color: "var(--accent)" }} />
              <span className="min-w-0 flex-1">
                <span className="t-title block">{team.teamName}</span>
                <span className="t-secondary block break-all" style={{ color: "var(--fg-3)" }}>
                  {env.appUrl}/api/ical/{team.feedToken}
                </span>
              </span>
              <a className="btn-quiet" href={`/api/ical/${team.feedToken}`}>
                Subscribe
              </a>
            </div>
          ))}
          <p className="t-secondary mt-2">
            Subscribe once. If the club moves a game, your calendar moves with it.
          </p>
        </>
      ) : null}

      {page.teams.some((t) => t.roster.length > 0) ? (
        <>
          <h2 className="t-label mt-8">Squad lists</h2>
          {page.teams.map((team) =>
            team.roster.length === 0 ? null : (
              <div key={`${team.teamId}-roster`} className="panel mt-3 p-4">
                <p className="t-title">{team.teamName}</p>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
                  {team.roster.map((mate, i) => (
                    <span key={`${team.teamId}-${i}`} className="t-secondary">
                      {mate.jerseyNumber ? `#${mate.jerseyNumber} ` : ""}
                      {mate.displayName}
                    </span>
                  ))}
                </div>
                <p className="t-secondary mt-3" style={{ color: "var(--fg-3)" }}>
                  First names and numbers only. No other family&apos;s contact details are shown
                  here, and yours are not shown to them.
                </p>
              </div>
            ),
          )}
        </>
      ) : null}

      <h2 className="t-label mt-8">Volunteer slots</h2>
      {page.myClaims.length > 0 ? (
        <div className="mb-4">
          {page.myClaims.map((slot) => {
            const mine = slot.claimed.find((c) => c.householdId === page.household.id);
            return (
              <div key={slot.slot.id} className="row">
                <IconCheck size={18} style={{ color: "var(--accent)" }} />
                <span className="min-w-0 flex-1">
                  <span className="t-title block truncate">{slot.label}</span>
                  <span className="t-secondary block" style={{ color: "var(--fg-3)" }}>
                    {slot.when}
                    {slot.where ? ` · ${slot.where}` : ""}
                  </span>
                </span>
                {mine ? (
                  <ReleaseForm action={releaseClaimAction} token={token} claimId={mine.claimId} />
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}
      {page.openSlots.length === 0 ? (
        <p className="t-secondary py-2">
          Nothing needs hands right now. When the club adds slots they show up here and you can claim
          one in a tap.
        </p>
      ) : (
        <div className="stagger">
          {page.openSlots.slice(0, 12).map((slot) => (
            <div key={slot.slot.id} className="row">
              <span className="min-w-0 flex-1">
                <span className="t-title block truncate">{slot.label}</span>
                <span className="t-secondary block" style={{ color: "var(--fg-3)" }}>
                  {slot.when}
                  {slot.where ? ` · ${slot.where}` : ""}
                </span>
              </span>
              <span className="t-data" style={{ color: "var(--warn)" }}>
                {slot.slot.capacity - slot.spotsLeft} / {slot.slot.capacity}
              </span>
              <ClaimForm
                action={claimSlotAction}
                token={token}
                slotId={slot.slot.id}
                role={slot.slot.role}
                spotsLeft={slot.spotsLeft}
              />
            </div>
          ))}
        </div>
      )}

      <h2 className="t-label mt-8">Everything the club has sent you</h2>
      {page.messages.length === 0 ? (
        <p className="t-secondary py-2">Nothing yet.</p>
      ) : (
        page.messages.map((message, i) => (
          <details key={i} className="disclosure panel mt-3 p-4">
            <summary>
              <span className="t-title">{message.subject}</span>
              <span
                className="t-secondary mt-1 flex items-center gap-2"
                style={{ color: "var(--fg-3)" }}
              >
                {message.sentAt ? formatIso(message.sentAt.toISOString().slice(0, 10)) : "queued"} ·{" "}
                {message.channel}
                {message.openedAt ? (
                  <>
                    <IconEye size={12} />
                    seen
                  </>
                ) : null}
              </span>
            </summary>
            <p className="t-body mt-3 whitespace-pre-wrap">{message.body}</p>
          </details>
        ))
      )}

      <p className="t-secondary mt-10" style={{ color: "var(--fg-3)" }}>
        This page is yours — keep the link. Questions about a fee or a place go to the club
        registrar{page.club.replyTo ? ` at ${page.club.replyTo}` : ""}.
      </p>
    </main>
  );
}

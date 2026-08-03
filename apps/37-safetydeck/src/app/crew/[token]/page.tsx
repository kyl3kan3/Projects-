import type { Metadata } from "next";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { companies, crews, signOffs, talkInstances, talks } from "@/db/schema";
import { verifyCrewToken } from "@/lib/crew-token";
import { rosterFor } from "@/lib/signoff";
import { monthDayYear } from "@/lib/dates";
import { CrewFlow } from "./CrewFlow";
import { IconAlertTriangle } from "@/components/icons";

export const metadata: Metadata = {
  title: "Toolbox talk",
  robots: { index: false, follow: false },
};

// The link is a capability URL; nothing about it is cacheable at the edge.
export const dynamic = "force-dynamic";

/**
 * The crew flow's server half: verify the link, load the talk, the roster, and
 * whatever has already been signed, and hand it all to the client in one payload
 * so the phone has everything it needs before it loses signal.
 *
 * No login, no account, no app. Error screens name the crew and tell the foreman
 * what to do — a dead end at a jobsite means the talk does not happen.
 */
export default async function CrewPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const verified = await verifyCrewToken(token);

  if (!verified.ok) {
    return (
      <LinkProblem
        title={verified.reason === "expired" ? "This link has expired" : "This link is not valid"}
        body={
          verified.reason === "expired"
            ? "Crew links last three weeks. Ask the office to resend this week's talk and the new link will work straight away. Nothing you already signed on this phone is lost."
            : "The link may have been cut short by the messaging app. Ask the office to resend it, and open it directly from the text rather than copying it."
        }
      />
    );
  }

  const db = getDb();
  const [row] = await db
    .select({ instance: talkInstances, crew: crews, talk: talks, company: companies })
    .from(talkInstances)
    .innerJoin(crews, eq(crews.id, talkInstances.crewId))
    .innerJoin(talks, eq(talks.id, talkInstances.talkId))
    .innerJoin(companies, eq(companies.id, talkInstances.companyId))
    .where(eq(talkInstances.id, verified.payload.ti));

  if (!row) {
    return (
      <LinkProblem
        title="This talk is no longer scheduled"
        body="The office may have removed it. Ask them to resend this week's talk."
      />
    );
  }

  if (row.instance.tokenHash !== verified.tokenHash) {
    return (
      <LinkProblem
        title="There is a newer link"
        body={`The office resent this week's talk for ${row.crew.name}, which replaced this link. Open the most recent text — signatures you have already collected on this phone will still sync.`}
      />
    );
  }

  if (row.company.readOnly) {
    return (
      <LinkProblem
        title="This account is paused"
        body={`${row.company.name}'s SafetyDeck account is read-only, so new sign-offs cannot be captured. Existing records are safe. Ask the office to reactivate.`}
      />
    );
  }

  const roster = await rosterFor(row.crew.companyId, row.crew.id);
  const existing = await db
    .select({ employeeId: signOffs.employeeId, signedAt: signOffs.signedAt })
    .from(signOffs)
    .where(and(eq(signOffs.talkInstanceId, row.instance.id)));

  return (
    <CrewFlow
      token={token}
      instanceId={row.instance.id}
      crewName={row.crew.name}
      siteLabel={row.crew.siteLabel}
      companyName={row.company.name}
      scheduledFor={monthDayYear(row.instance.scheduledFor)}
      talk={{
        title: row.talk.title,
        body: row.talk.bodyMd,
        hazardTags: row.talk.hazardTags,
        estMinutes: row.talk.estMinutes,
      }}
      roster={roster.map((e) => ({ id: e.id, name: e.name, jobTitle: e.jobTitle }))}
      alreadySigned={existing.map((s) => ({
        employeeId: s.employeeId,
        signedAt: s.signedAt.toISOString(),
      }))}
      hasPhoto={Boolean(row.instance.sitePhotoKey)}
      completed={row.instance.status === "completed"}
    />
  );
}

function LinkProblem({ title, body }: { title: string; body: string }) {
  return (
    <main className="screen-plain mx-auto max-w-[420px] pt-16">
      <IconAlertTriangle size={28} style={{ color: "var(--color-orange)" }} />
      <h1 className="t-h2 mt-4">{title}</h1>
      <p className="t-body mt-3" style={{ color: "var(--color-fg-2)" }}>
        {body}
      </p>
      <p className="t-secondary mt-8 rule-t pt-5">
        SafetyDeck · toolbox talks and crew sign-off. No app to install, no account to
        remember.
      </p>
    </main>
  );
}

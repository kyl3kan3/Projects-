import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { formatIso } from "@/lib/dates";
import { listAnnouncements, resolveSegment, segmentLabel } from "@/lib/announcements";
import { can, featureAllowed, planForFeature } from "@/lib/plans";
import { Notice, Pill } from "@/components/ledger";
import { IconChevronRight, IconHorn } from "@/components/icons";
import { OverflowLinks } from "@/components/TabBar";
import { ComposeForm, type Reach } from "./AnnounceForms";
import type { SegmentSpec } from "@/db/schema";

export const metadata: Metadata = { title: "Announce" };
export const dynamic = "force-dynamic";

const SEGMENTS: { key: string; label: string; spec: SegmentSpec }[] = [
  { key: "all", label: "Every active household", spec: { kind: "all" } },
  {
    key: "delinquent:any",
    label: "Households with a balance",
    spec: { kind: "delinquent", bucket: "any" },
  },
  { key: "delinquent:30", label: "1-30 days past due", spec: { kind: "delinquent", bucket: "30" } },
  { key: "delinquent:60", label: "31-60 days past due", spec: { kind: "delinquent", bucket: "60" } },
  { key: "delinquent:90", label: "Over 60 days past due", spec: { kind: "delinquent", bucket: "90" } },
];

export default async function AnnouncePage() {
  const { user, association } = await requireUser();
  const canSend = can(user.role, "announce");
  const smsAllowed = featureAllowed(association.plan, "sms");

  const reaches: Reach[] = await Promise.all(
    SEGMENTS.map(async (segment) => {
      const resolution = await resolveSegment(association.id, segment.spec);
      return {
        key: segment.key,
        label: segment.label,
        recipients: resolution.recipients.length,
        emailReach: resolution.emailReach,
        smsReach: resolution.smsReach,
      };
    }),
  );

  const history = await listAnnouncements(association.id);
  const unreachable = (await resolveSegment(association.id, { kind: "all" })).unreachable;

  return (
    <main className="screen">
      <header className="flex items-start justify-between gap-4 pt-8">
        <div>
          <p className="t-label">Announcements</p>
          <h1 className="t-h2 mt-1">Say it once. See who got it.</h1>
          <p className="t-secondary mt-1">
            {reaches[0]?.recipients ?? 0} people across the roster · {reaches[0]?.emailReach ?? 0}{" "}
            reachable by email
            {smsAllowed ? ` · ${reaches[0]?.smsReach ?? 0} by text` : ""}
          </p>
        </div>
        <OverflowLinks />
      </header>

      {unreachable > 0 ? (
        <section className="mt-6">
          <Notice>
            {unreachable} {unreachable === 1 ? "person has" : "people have"} neither an email address
            nor a phone number, so nothing digital reaches them. The delivery report on each send
            lets you fix an address inline.
          </Notice>
        </section>
      ) : null}

      {canSend ? (
        <section className="mt-8">
          <h2 className="t-h2">Compose</h2>
          <div className="panel mt-4 p-5">
            <ComposeForm
              reaches={reaches}
              smsAllowed={smsAllowed}
              upgradeName={planForFeature("sms").name}
            />
          </div>
        </section>
      ) : (
        <section className="mt-8">
          <Notice>
            Your role is {user.role}, so you can read what went out but not send. The secretary,
            treasurer, and president can send.
          </Notice>
        </section>
      )}

      <section className="mt-10">
        <h2 className="t-h2">Sent</h2>
        {history.length === 0 ? (
          <div className="panel mt-4 p-5">
            <div className="flex items-center gap-2">
              <IconHorn size={20} className="ink-3" />
              <p className="t-title">Nothing sent yet.</p>
            </div>
            <p className="t-secondary mt-2">
              A monthly note — what was collected, what is open, when the next meeting is — is what
              keeps a board visible between dues cycles.
            </p>
          </div>
        ) : (
          <div className="stagger mt-2">
            {history.map(({ announcement, delivered, problems }) => (
              <Link key={announcement.id} href={`/announce/${announcement.id}`} className="row">
                <span className="min-w-0 flex-1">
                  <span className="t-title block truncate">{announcement.subject}</span>
                  <span className="t-secondary block truncate">
                    {segmentLabel(announcement.segment)} ·{" "}
                    {announcement.sentAt
                      ? formatIso(announcement.sentAt.toISOString().slice(0, 10))
                      : "not sent"}
                  </span>
                  <span className="t-data ink-2 mt-1 block">
                    {delivered} delivered
                    {problems > 0 ? ` · ${problems} to fix` : ""}
                  </span>
                </span>
                <span className="flex flex-none items-center gap-2">
                  {problems > 0 ? <Pill tone="warn">Check</Pill> : <Pill tone="good">Sent</Pill>}
                  <IconChevronRight size={18} className="ink-3" />
                </span>
              </Link>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

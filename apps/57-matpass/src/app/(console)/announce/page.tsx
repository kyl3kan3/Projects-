import type { Metadata } from "next";
import Link from "next/link";
import { and, asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { programs } from "@/db/schema";
import { LinkRow, Pill, ScreenTitle, SectionHead } from "@/components/ui";
import { listAnnouncements } from "@/lib/announcements";
import { requireSchool } from "@/lib/auth";
import { emailConfigured } from "@/lib/env";
import { formatDate } from "@/lib/time";
import { ComposeForm } from "./ComposeForm";

export const metadata: Metadata = { title: "Announcements" };

export default async function AnnouncePage() {
  const { school } = await requireSchool();
  const db = getDb();

  const [programList, announcements] = await Promise.all([
    db
      .select({ id: programs.id, name: programs.name })
      .from(programs)
      .where(and(eq(programs.schoolId, school.id), eq(programs.status, "active")))
      .orderBy(asc(programs.name)),
    listAnnouncements(school.id),
  ]);

  return (
    <main className="screen">
      <ScreenTitle
        eyebrow="Email the school"
        title="Announcements"
        action={
          <Link href="/settings" className="btn-quiet">
            Settings
          </Link>
        }
      />
      <p className="t-secondary">
        One email per household, whatever their kids&rsquo; programs. Every send records a
        per-household outcome, so &ldquo;42 delivered · 1 bounced&rdquo; comes with the address to
        fix.
      </p>

      <ComposeForm programs={programList} simulated={!emailConfigured()} />

      <SectionHead>Sent</SectionHead>
      {announcements.length === 0 ? (
        <p className="t-secondary fg-3">
          Nothing sent yet. Grading dates, holiday closures and belt-testing reminders are what this
          is for.
        </p>
      ) : (
        <div>
          {announcements.map((announcement) => {
            const total = Object.values(announcement.counts).reduce((a, b) => a + b, 0);
            const bad = announcement.counts.bounced + announcement.counts.failed;
            return (
              <LinkRow
                key={announcement.id}
                href={`/announce/${announcement.id}`}
                title={announcement.subject}
                secondary={`${announcement.audienceLabel} · ${
                  announcement.sentAt ? formatDate(announcement.sentAt, school.timezone) : "not sent"
                } · ${announcement.counts.sent + announcement.counts.delivered} of ${total} delivered`}
                right={bad > 0 ? <Pill tone="warn">{bad} failed</Pill> : <Pill tone="ok">Sent</Pill>}
              />
            );
          })}
        </div>
      )}
    </main>
  );
}

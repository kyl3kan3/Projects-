import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { clockTime, monthDay, monthDayYear, todayIso } from "@/lib/dates";
import { instanceDetail } from "@/lib/signoff";
import { displayStatus, libraryFor, STATUS_LABELS } from "@/lib/talks";
import { ScreenHeader } from "@/components/ScreenHeader";
import { StatusPill } from "@/components/StatusPill";
import { SignatureMark } from "@/components/SignatureMark";
import { TalkBody } from "@/components/TalkBody";
import { IconCamera, IconCloudOff, IconMapPin } from "@/components/icons";
import { objectUrl } from "@/lib/storage";
import { CrewLinkTools } from "./CrewLinkTools";
import { VoidSignature } from "./VoidSignature";

export const metadata: Metadata = { title: "Talk detail" };

export default async function InstancePage({
  params,
}: {
  params: Promise<{ instanceId: string }>;
}) {
  const { instanceId } = await params;
  const { company } = await requireUser();
  const detail = await instanceDetail(company.id, instanceId);
  if (!detail) notFound();

  const today = todayIso(company.timezone);
  const status = displayStatus(detail.instance, today, company.settings.missedGraceHours);
  const library = await libraryFor(company.id);
  const signedIds = new Set(detail.signatures.map((s) => s.employeeId));
  const absentIds = new Set(detail.instance.absentEmployeeIds ?? []);

  return (
    <main className="screen">
      <ScreenHeader
        label={`${detail.crew.name} · week of ${monthDay(detail.instance.weekOf)}`}
        title={detail.talk.title}
        back={{ href: "/talks", label: "This week" }}
        action={
          <StatusPill tone={status === "completed" ? "green" : status === "missed" ? "orange" : "faint"}>
            {STATUS_LABELS[status]}
          </StatusPill>
        }
      />

      <dl className="rule-t rule-b grid grid-cols-2 gap-y-3 py-4">
        <Fact label="Scheduled" value={monthDayYear(detail.instance.scheduledFor)} />
        <Fact
          label="Signed"
          value={`${detail.signatures.length} of ${detail.roster.length}`}
        />
        <Fact
          label="Completed"
          value={
            detail.instance.completedAt
              ? `${clockTime(detail.instance.completedAt, company.timezone)} · ${monthDay(
                  detail.instance.completedAt.toISOString().slice(0, 10),
                )}`
              : "—"
          }
        />
        <Fact label="Foreman" value={detail.crew.foremanName} />
      </dl>

      {detail.instance.syncedFromOffline ? (
        <p className="t-secondary mt-4 flex items-center gap-2">
          <IconCloudOff size={18} style={{ color: "var(--color-fg-2)" }} />
          Captured offline at the huddle and synced later. Both times are on every signature
          below — nothing was back-dated to look contemporaneous.
        </p>
      ) : null}

      <section className="mt-8">
        <h2 className="t-label">Sign-offs</h2>
        <div className="mt-2">
          {detail.roster.map((person, i) => {
            const sig = detail.signatures.find((s) => s.employeeId === person.id);
            const correction = sig
              ? detail.corrections.find((c) => c.signOffId === sig.id)
              : undefined;
            return (
              <div
                key={person.id}
                className="rule-b row-in flex flex-col gap-2 py-4"
                style={{ animationDelay: `${i * 24}ms` }}
              >
                <div className="flex items-center gap-3">
                  <span className="min-w-0 flex-1">
                    <span className="t-title block truncate">{person.name}</span>
                    <span className="t-secondary block truncate">
                      {person.jobTitle ?? "Job title not set"}
                    </span>
                  </span>
                  {sig ? (
                    <span className="t-data shrink-0" style={{ color: "var(--color-green)" }}>
                      {clockTime(sig.signedAt, company.timezone)}
                    </span>
                  ) : (
                    <span className="t-data shrink-0" style={{ color: "var(--color-fg-3)" }}>
                      {absentIds.has(person.id) ? "ABSENT" : "WAITING"}
                    </span>
                  )}
                </div>
                {sig ? (
                  <div className="flex flex-wrap items-end gap-4">
                    <SignatureMark
                      path={sig.signaturePath}
                      sourceWidth={sig.signatureWidth}
                      sourceHeight={sig.signatureHeight}
                      height={48}
                      ariaLabel={`Signature captured for ${person.name}`}
                    />
                    <p className="t-data" style={{ color: "var(--color-fg-3)", lineHeight: 1.5 }}>
                      SIGNED {sig.signedAt.toISOString().slice(11, 16)}Z
                      {sig.capturedOffline ? " · OFFLINE" : ""}
                      <br />
                      SYNCED {sig.syncedAt.toISOString().slice(11, 16)}Z
                      <br />
                      DEVICE {sig.deviceId.slice(0, 12)}
                    </p>
                    {correction ? (
                      <p className="t-secondary w-full" style={{ color: "var(--color-orange)" }}>
                        Correction by {correction.actor}: {correction.reason}
                      </p>
                    ) : (
                      <VoidSignature signOffId={sig.id} instanceId={instanceId} name={person.name} />
                    )}
                  </div>
                ) : null}
              </div>
            );
          })}
          {detail.roster.length === 0 ? (
            <p className="t-secondary py-4">
              This crew has nobody on its roster yet, so there is nobody to sign. Add the
              field employees in Settings.
            </p>
          ) : null}
        </div>
        {signedIds.size > 0 && signedIds.size === detail.roster.length ? (
          <p className="t-data mt-3" style={{ color: "var(--color-green)" }}>
            CREW SIGNED
            {detail.instance.completedAt
              ? ` · ${clockTime(detail.instance.completedAt, company.timezone)}`
              : ""}
          </p>
        ) : null}
      </section>

      {detail.instance.sitePhotoKey || detail.instance.gpsLat !== null ? (
        <section className="mt-8">
          <h2 className="t-label">Huddle evidence</h2>
          {detail.instance.sitePhotoKey ? (
            <a
              className="row"
              href={objectUrl(detail.instance.sitePhotoKey)}
              target="_blank"
              rel="noreferrer"
            >
              <IconCamera size={18} style={{ color: "var(--color-fg-3)" }} />
              <span className="t-title flex-1">Photo of the huddle</span>
              <span className="t-data" style={{ color: "var(--color-fg-3)" }}>
                OPEN
              </span>
            </a>
          ) : null}
          {detail.instance.gpsLat !== null && detail.instance.gpsLng !== null ? (
            <div className="row">
              <IconMapPin size={18} style={{ color: "var(--color-fg-3)" }} />
              <span className="t-title flex-1">Location stamp</span>
              <span className="t-data" style={{ color: "var(--color-fg-3)" }}>
                {detail.instance.gpsLat.toFixed(4)}, {detail.instance.gpsLng.toFixed(4)}
              </span>
            </div>
          ) : null}
        </section>
      ) : null}

      <section className="mt-8">
        <h2 className="t-label">Crew link</h2>
        <CrewLinkTools
          instanceId={instanceId}
          library={library.map((t) => ({ id: t.id, title: t.title }))}
          currentTalkId={detail.talk.id}
          completed={status === "completed"}
        />
      </section>

      <section className="mt-10">
        <h2 className="t-label">What the crew read</h2>
        <div className="talk-card mt-3">
          <p className="t-label" style={{ color: "var(--color-hardhat)" }}>
            {detail.talk.hazardTags.join(" · ").toUpperCase()} · {detail.talk.estMinutes} MIN
          </p>
          <h3 className="t-h2 mt-2">{detail.talk.title}</h3>
          <TalkBody body={detail.talk.bodyMd} />
        </div>
      </section>
    </main>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="t-label">{label}</dt>
      <dd className="t-data mt-1">{value}</dd>
    </div>
  );
}

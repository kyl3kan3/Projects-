import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { EmptyState } from "@/components/ui";
import { visitValueCentsFor } from "@/lib/attribution";
import { formatDay, formatDayShort, formatMonthYear, fromDayString } from "@/lib/dates";
import { relativeDays } from "@/lib/format";
import { monthsOverdue } from "@/lib/recall";
import { pendingBookingRequests, queueProgress, queueDateFor, todaysQueue } from "@/server/queue";
import { QueueCard } from "./QueueCard";
import { RequestCard } from "./RequestCard";
import { RebuildButton } from "./RebuildButton";
import {
  confirmRequestAction,
  dismissRequestAction,
  dispositionAction,
  rebuildQueueAction,
} from "./actions";

export const metadata: Metadata = { title: "Call queue" };
export const dynamic = "force-dynamic";

export default async function QueuePage() {
  const { practice, location } = await requireUser();
  const now = new Date();
  const visitValueCents = visitValueCentsFor(practice.settings);
  const queueDate = queueDateFor(location.timezone, now);

  const [cards, progress, requests] = await Promise.all([
    todaysQueue({ locationId: location.id, queueDate, visitValueCents, today: now }),
    queueProgress({ locationId: location.id, queueDate }),
    pendingBookingRequests(location.id),
  ]);

  const dateLabel = formatDay(fromDayString(queueDate) ?? now);

  return (
    <main className="screen">
      <header
        style={{
          paddingTop: 24,
          paddingBottom: 16,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 12,
        }}
      >
        <div>
          <p className="t-label" style={{ margin: 0 }}>
            {dateLabel}
          </p>
          <h1 className="t-h2" style={{ margin: "4px 0 0" }}>
            {progress.worked} of {progress.total} worked
          </h1>
          <p className="t-secondary" style={{ margin: "4px 0 0" }}>
            {progress.booked} booked today · ranked by value, urgency and silence
          </p>
        </div>
        <RebuildButton action={rebuildQueueAction} />
      </header>

      {requests.length > 0 && (
        <section style={{ marginBottom: 24 }}>
          <p className="t-label" style={{ margin: "0 0 8px" }}>
            From booking links
          </p>
          {requests.map((request) => (
            <RequestCard
              key={request.id}
              request={{
                id: request.id,
                patientId: request.patientId,
                patientName: request.patientName,
                phone: request.phone,
                windows: request.preferredWindows.map(
                  (w) => `${weekdayFor(w.day)} ${w.period === "am" ? "AM" : "PM"}`,
                ),
                note: request.note,
                askedOn: formatDayShort(request.createdAt),
              }}
              confirm={confirmRequestAction}
              dismiss={dismissRequestAction}
            />
          ))}
        </section>
      )}

      {cards.length === 0 ? (
        <EmptyState
          icon="phone-handset"
          title="No calls queued for today"
          body="The queue is built each morning from patients who are overdue, reachable by phone, not mid-sequence in a campaign, and not contacted recently. Import a roster or rebuild the ranking to fill it."
          action={{ href: "/overdue", label: "See the overdue list" }}
        />
      ) : (
        <section>
          {cards.map((card) => {
            const months = monthsOverdue(card.patient.nextDueOn, now);
            const context = [
              card.patient.lastVisitOn
                ? `last visit ${formatMonthYear(card.patient.lastVisitOn)}`
                : "no visit on file",
              card.patient.nextDueOn ? `due since ${formatMonthYear(card.patient.nextDueOn)}` : null,
              months > 0 ? `${months} months overdue` : null,
              card.lastTouchAt
                ? `${channelWord(card.lastTouchChannel)} ${relativeDays(
                    Math.floor((now.getTime() - card.lastTouchAt.getTime()) / 86_400_000),
                  )}`
                : "never contacted",
            ]
              .filter(Boolean)
              .join(" · ");

            return (
              <QueueCard
                key={card.task.id}
                task={{
                  id: card.task.id,
                  rank: card.task.rank,
                  name: `${card.patient.firstName} ${card.patient.lastName}`,
                  phone: card.patient.phone,
                  valueCents: card.valueCents,
                  bucket: card.bucket,
                  context,
                  status: card.task.status,
                  note: card.task.note,
                  handled: card.task.status !== "todo",
                }}
                action={dispositionAction}
              />
            );
          })}
        </section>
      )}
    </main>
  );
}

function weekdayFor(day: string): string {
  const date = fromDayString(day);
  if (!date) return day;
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][date.getUTCDay()];
}

function channelWord(channel: "email" | "sms" | "call" | null): string {
  if (channel === "sms") return "texted";
  if (channel === "email") return "emailed";
  if (channel === "call") return "called";
  return "touched";
}

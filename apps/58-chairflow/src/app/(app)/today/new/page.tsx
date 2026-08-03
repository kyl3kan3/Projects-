import type { Metadata } from "next";
import Link from "next/link";
import { ManualBookingForm } from "@/app/(app)/today/new/ManualBookingForm";
import { EmptyState, ScreenHeader } from "@/components/ui";
import { requireStylist } from "@/lib/auth";
import { formatClock, formatDayChip, formatWhen, todayInTimezone } from "@/lib/dates";
import { duration, moneyShort } from "@/lib/format";
import { activeServices, bookableDays, openSlots, serviceById } from "@/server/appointments";

export const metadata: Metadata = { title: "Add appointment" };

/**
 * Adding an appointment by hand, in three steps held in the URL: service, then day and
 * time, then who.
 *
 * Availability is computed by the same function that draws the public picker, so a slot
 * offered here is a slot that is genuinely free — including against the min-notice rule the
 * stylist set. The URL holding the state means the back button works, which on a phone is
 * the control people actually use.
 */
export default async function AddAppointmentPage({
  searchParams,
}: {
  searchParams: Promise<{ service?: string; day?: string; slot?: string }>;
}) {
  const { stylist } = await requireStylist();
  const params = await searchParams;
  const now = new Date();
  const services = await activeServices(stylist.id);

  if (services.length === 0) {
    return (
      <>
        <ScreenHeader label="Add appointment" title="No services yet" />
        <EmptyState
          icon="policy-scroll"
          title="Add a service first"
          body="An appointment needs a service, a duration and a price — that is what the fee policy works from."
          action={{ href: "/settings/services", label: "Add your services" }}
        />
      </>
    );
  }

  const service = params.service ? await serviceById(params.service) : null;
  const valid = service && service.stylistId === stylist.id && service.status === "active";

  if (!valid) {
    return (
      <>
        <ScreenHeader label="Add appointment" title="Which service?" />
        <div className="stack" style={{ gap: 8 }}>
          {services.map((s) => (
            <Link key={s.id} href={`/today/new?service=${s.id}`} className="slot">
              <span style={{ minWidth: 0, display: "grid", gap: 2 }}>
                <span className="t-title">{s.name}</span>
                <span className="t-secondary">{duration(s.durationMinutes)}</span>
              </span>
              <span className="slot-price">{moneyShort(s.priceCents)}</span>
            </Link>
          ))}
        </div>
      </>
    );
  }

  const days = bookableDays(stylist, 14, now);
  const day = params.day && days.includes(params.day) ? params.day : days[0];
  const slotsByDay = await openSlots({ stylist, service, days, now });
  const daySlots = slotsByDay.find((d) => d.day === day)?.slots ?? [];

  if (params.slot) {
    const chosen = daySlots.find((s) => s.startsAt.toISOString() === params.slot);
    if (chosen) {
      return (
        <>
          <ScreenHeader label={service.name} title="Who is it for?" />
          <ManualBookingForm
            serviceId={service.id}
            startsAt={chosen.startsAt.toISOString()}
            whenLabel={formatWhen(stylist.timezone, chosen.startsAt)}
            serviceLabel={`${service.name} · ${moneyShort(service.priceCents)}`}
          />
          <p style={{ marginTop: 16 }}>
            <Link className="btn-quiet" href={`/today/new?service=${service.id}&day=${day}`}>
              Pick a different time
            </Link>
          </p>
        </>
      );
    }
  }

  const today = todayInTimezone(stylist.timezone, now);

  return (
    <>
      <ScreenHeader label={`${service.name} · ${duration(service.durationMinutes)}`} title="When?" />

      <div className="scroll-x" style={{ paddingBottom: 12 }}>
        <div style={{ display: "flex", gap: 8 }}>
          {days.map((d) => {
            const count = slotsByDay.find((x) => x.day === d)?.slots.length ?? 0;
            return (
              <Link
                key={d}
                href={`/today/new?service=${service.id}&day=${d}`}
                className="chip chip-lg"
                data-active={d === day}
                aria-disabled={count === 0}
              >
                <span>{d === today ? "Today" : formatDayChip(d)}</span>
                <span className="t-mono" style={{ fontSize: "0.625rem", color: "var(--color-ink-2)" }}>
                  {count === 0 ? "full" : `${count} open`}
                </span>
              </Link>
            );
          })}
        </div>
      </div>

      {daySlots.length === 0 ? (
        <EmptyState
          icon="clock"
          title="Nothing free that day"
          body="Either the day is off in your working hours, or it is already full. Try another day."
        />
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(88px, 1fr))",
            gap: 8,
          }}
        >
          {daySlots.map((slot) => (
            <Link
              key={slot.startsAt.toISOString()}
              href={`/today/new?service=${service.id}&day=${day}&slot=${encodeURIComponent(slot.startsAt.toISOString())}`}
              className="chip"
              style={{ justifyContent: "center", minHeight: 44 }}
            >
              <span className="t-mono">{formatClock(stylist.timezone, slot.startsAt)}</span>
            </Link>
          ))}
        </div>
      )}

      <p style={{ marginTop: 24 }}>
        <Link className="btn-quiet" href="/today/new">
          Different service
        </Link>
      </p>
    </>
  );
}

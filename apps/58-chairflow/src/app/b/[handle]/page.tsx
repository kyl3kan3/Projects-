import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BookingForm, type CardMode } from "@/app/b/[handle]/BookingForm";
import { Icon } from "@/components/icons";
import { stylistByHandle } from "@/lib/auth";
import { stripeConfigured } from "@/lib/env";
import {
  formatClock,
  formatDayChip,
  formatWhen,
  todayInTimezone,
} from "@/lib/dates";
import { duration, moneyShort } from "@/lib/format";
import { bookingPageLive, type Billable } from "@/lib/plans";
import { depositFor, depositRuleLabel, parseDepositRule, policySummary } from "@/lib/policy";
import { verifyToken } from "@/lib/tokens";
import {
  activeServices,
  bookableDays,
  currentPolicy,
  openSlots,
  policyTerms,
  serviceById,
} from "@/server/appointments";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ handle: string }>;
}): Promise<Metadata> {
  const { handle } = await params;
  const stylist = await stylistByHandle(handle);
  if (!stylist) return { title: "Not found" };
  return {
    title: `Book with ${stylist.displayName}`,
    description:
      stylist.bio ??
      `Book an appointment with ${stylist.displayName}${stylist.chairLocation ? ` at ${stylist.chairLocation}` : ""}.`,
  };
}

/**
 * The public booking page. The money surface.
 *
 * Opened from an Instagram bio, on a phone, one-handed. Four steps held in the URL — service,
 * day, time, then contact — so the back button works, which is the control people actually
 * use on a phone. No client account, ever: name and mobile, and that is the whole identity.
 *
 * Two states matter as much as the happy path:
 *
 *   - A closed page (lapsed subscription) says **fully booked**. It never shows a client an
 *     error, a payment problem or an empty screen: the stylist's brand is not the hostage of
 *     their card being declined.
 *   - A chair without Stripe still takes bookings, cardless, and says so before the tap.
 */
export default async function BookingPage({
  params,
  searchParams,
}: {
  params: Promise<{ handle: string }>;
  searchParams: Promise<{ service?: string; day?: string; slot?: string; n?: string }>;
}) {
  const { handle } = await params;
  const query = await searchParams;
  const stylist = await stylistByHandle(handle);
  if (!stylist) notFound();

  const now = new Date();
  const [services, policy] = await Promise.all([
    activeServices(stylist.id),
    currentPolicy(stylist.id),
  ]);

  const live = bookingPageLive(stylist as Billable, now);

  if (!live || services.length === 0 || !policy) {
    return (
      <main className="screen-plain" style={{ maxWidth: 480, paddingTop: 40 }}>
        <Header stylist={stylist} />
        <div className="card" style={{ padding: 24, marginTop: 24 }}>
          <p className="t-title" style={{ margin: 0 }}>
            Fully booked
          </p>
          <p className="t-secondary" style={{ margin: "8px 0 0" }}>
            {stylist.displayName} is not taking bookings online right now.
            {stylist.chairLocation ? ` You can still find them at ${stylist.chairLocation}.` : ""}
          </p>
        </div>
      </main>
    );
  }

  // A nudge link pre-fills the service it was sent about, so the one-tap rebooking really is
  // one tap.
  let nudgeToken: string | null = null;
  let nudgeServiceId: string | null = null;
  if (query.n) {
    const verified = await verifyToken("nudge_booking", query.n);
    if (verified) {
      nudgeToken = query.n;
      const claimed = verified.claims.serviceId;
      if (typeof claimed === "string") nudgeServiceId = claimed;
    }
  }

  const requestedServiceId = query.service ?? nudgeServiceId ?? null;
  const serviceRaw = requestedServiceId ? await serviceById(requestedServiceId) : null;
  const service =
    serviceRaw && serviceRaw.stylistId === stylist.id && serviceRaw.status === "active"
      ? serviceRaw
      : null;

  const terms = policyTerms(policy);
  const suffix = nudgeToken ? `&n=${encodeURIComponent(nudgeToken)}` : "";

  /* --- Step 1: which service --- */
  if (!service) {
    return (
      <main className="screen-plain" style={{ maxWidth: 480, paddingTop: 40 }}>
        <Header stylist={stylist} />
        <p className="t-label" style={{ margin: "24px 0 8px" }}>
          What are you booking?
        </p>
        <div className="stack" style={{ gap: 8 }}>
          {services.map((s) => {
            const rule = parseDepositRule(s.depositRule);
            return (
              <Link key={s.id} href={`/b/${handle}?service=${s.id}${suffix}`} className="slot">
                <span style={{ minWidth: 0, display: "grid", gap: 2 }}>
                  <span className="t-title">{s.name}</span>
                  <span className="t-secondary">
                    <span className="t-mono">{duration(s.durationMinutes)}</span>
                    {rule.kind !== "none" ? ` · ${depositRuleLabel(rule, s.priceCents)}` : ""}
                  </span>
                </span>
                <span className="slot-price">{moneyShort(s.priceCents)}</span>
              </Link>
            );
          })}
        </div>
        <PolicyPanel policyText={policy.policyText} version={policy.version} summary={policySummary(terms)} />
      </main>
    );
  }

  const days = bookableDays(stylist, 14, now);
  const day = query.day && days.includes(query.day) ? query.day : days[0];
  const slotsByDay = await openSlots({ stylist, service, days, now });
  const daySlots = slotsByDay.find((d) => d.day === day)?.slots ?? [];
  const today = todayInTimezone(stylist.timezone, now);
  const depositCents = depositFor(parseDepositRule(service.depositRule), service.priceCents);
  const cardMode: CardMode =
    stylist.connectStatus !== "active" || !stylist.stripeAccountId
      ? "none"
      : stripeConfigured()
        ? "elements"
        : "demo";

  /* --- Step 3: contact + the agreement --- */
  const chosen = query.slot
    ? daySlots.find((s) => s.startsAt.toISOString() === query.slot)
    : undefined;

  if (chosen) {
    return (
      <main className="screen-plain" style={{ maxWidth: 480, paddingTop: 40 }}>
        <Header stylist={stylist} />
        <div style={{ paddingTop: 24 }}>
          <PolicyPanel
            policyText={policy.policyText}
            version={policy.version}
            summary={policySummary(terms)}
            depositLabel={
              depositCents > 0 && cardMode !== "none"
                ? `${moneyShort(depositCents)} deposit today, applied to your service`
                : null
            }
          />
        </div>
        <div style={{ paddingTop: 20 }}>
          <BookingForm
            handle={handle}
            serviceId={service.id}
            startsAt={chosen.startsAt.toISOString()}
            whenLabel={formatWhen(stylist.timezone, chosen.startsAt)}
            serviceLabel={`${service.name} · ${moneyShort(service.priceCents)}`}
            depositLabel={depositCents > 0 ? `${moneyShort(depositCents)} deposit` : null}
            cardMode={cardMode}
            nudgeToken={nudgeToken}
          />
        </div>
        <p style={{ marginTop: 20 }}>
          <Link className="btn-quiet" href={`/b/${handle}?service=${service.id}&day=${day}${suffix}`}>
            <Icon name="chevron-left" size={18} />
            Pick another time
          </Link>
        </p>
      </main>
    );
  }

  /* --- Step 2: day and time --- */
  return (
    <main className="screen-plain" style={{ maxWidth: 480, paddingTop: 40 }}>
      <Header stylist={stylist} />

      <p className="t-label" style={{ margin: "24px 0 8px" }}>
        {service.name} · <span className="t-mono">{moneyShort(service.priceCents)}</span> ·{" "}
        <span className="t-mono">{duration(service.durationMinutes)}</span>
      </p>

      <div className="scroll-x" style={{ paddingBottom: 12 }}>
        <div style={{ display: "flex", gap: 8 }}>
          {days.map((d) => {
            const count = slotsByDay.find((x) => x.day === d)?.slots.length ?? 0;
            return (
              <Link
                key={d}
                href={`/b/${handle}?service=${service.id}&day=${d}${suffix}`}
                className="chip chip-lg"
                data-active={d === day}
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
        <div className="card" style={{ padding: 20 }}>
          <p className="t-title" style={{ margin: 0 }}>
            Nothing free that day
          </p>
          <p className="t-secondary" style={{ margin: "8px 0 0" }}>
            Try another day above. Every time shown here is genuinely open — there is no waiting
            to hear back.
          </p>
        </div>
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
              href={`/b/${handle}?service=${service.id}&day=${day}&slot=${encodeURIComponent(slot.startsAt.toISOString())}${suffix}`}
              className="chip"
              style={{ justifyContent: "center", minHeight: 44 }}
            >
              <span className="t-mono">{formatClock(stylist.timezone, slot.startsAt)}</span>
            </Link>
          ))}
        </div>
      )}

      <PolicyPanel policyText={policy.policyText} version={policy.version} summary={policySummary(terms)} />

      <p style={{ marginTop: 20 }}>
        <Link className="btn-quiet" href={`/b/${handle}${nudgeToken ? `?n=${encodeURIComponent(nudgeToken)}` : ""}`}>
          <Icon name="chevron-left" size={18} />
          Different service
        </Link>
      </p>
    </main>
  );
}

function Header({
  stylist,
}: {
  stylist: { displayName: string; handle: string; chairLocation: string | null; bio: string | null };
}) {
  return (
    <header>
      <p className="t-label" style={{ margin: 0 }}>
        Book with
      </p>
      <h1 className="t-h2" style={{ margin: "4px 0 0" }}>
        {stylist.displayName}
      </h1>
      <p className="t-mono" style={{ margin: "4px 0 0", color: "var(--color-cobalt)" }}>
        @{stylist.handle}
      </p>
      {stylist.chairLocation && (
        <p className="t-secondary" style={{ margin: "8px 0 0" }}>
          {stylist.chairLocation}
        </p>
      )}
      {stylist.bio && (
        <p className="t-secondary" style={{ margin: "4px 0 0" }}>
          {stylist.bio}
        </p>
      )}
    </header>
  );
}

/**
 * The policy panel. Versioned text, never truncated, never a tooltip — DESIGN.md is explicit,
 * and the reason is legal as much as aesthetic: text a client had to expand to read is text
 * they can argue they never saw.
 */
function PolicyPanel({
  policyText,
  version,
  summary,
  depositLabel,
}: {
  policyText: string;
  version: number;
  summary: string;
  depositLabel?: string | null;
}) {
  return (
    <section className="policy-panel" style={{ marginTop: 24 }}>
      <p className="t-label" style={{ margin: 0 }}>
        The policy
      </p>
      <p className="t-secondary" style={{ margin: "4px 0 12px" }}>
        {summary}
      </p>
      <p className="t-policy" style={{ margin: 0 }}>
        {policyText}
      </p>
      {depositLabel && (
        <p className="t-mono" style={{ margin: "12px 0 0", color: "var(--color-cobalt)" }}>
          {depositLabel}
        </p>
      )}
      <p
        className="t-secondary"
        style={{ margin: "12px 0 0", paddingTop: 12, borderTop: "1px solid var(--color-hairline)" }}
      >
        Booking means you agree to this. Version {version}.
      </p>
    </section>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { LogoutButton } from "@/app/(app)/settings/LogoutButton";
import { NotifyForm, ProfileForm } from "@/app/(app)/settings/SettingsForms";
import { Icon } from "@/components/icons";
import { DetailRow, ScreenHeader } from "@/components/ui";
import { requireStylist } from "@/lib/auth";
import { parseSettings } from "@/lib/cadence";
import { entitlement, planName, type Billable } from "@/lib/plans";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const { user, stylist } = await requireStylist();
  const settings = parseSettings(stylist.settings);
  const ent = entitlement(stylist as Billable);

  const links = [
    { href: "/settings/services", label: "Services and deposits", icon: "policy-scroll" as const },
    { href: "/settings/hours", label: "Working hours", icon: "calendar-sync" as const },
    { href: "/settings/policy", label: "Your fee policy", icon: "shield-card" as const },
    { href: "/settings/billing", label: "Plan and billing", icon: "ledger-line" as const },
  ];

  return (
    <>
      <ScreenHeader label={user.email} title="Settings" />

      <section className="stack" style={{ paddingBottom: 20 }}>
        {links.map((l) => (
          <Link key={l.href} href={l.href} className="row">
            <span style={{ color: "var(--color-ink-2)", display: "inline-flex" }}>
              <Icon name={l.icon} size={20} />
            </span>
            <span className="t-title" style={{ flex: 1 }}>
              {l.label}
            </span>
            <Icon name="chevron-right" size={18} style={{ color: "var(--color-ink-3)" }} />
          </Link>
        ))}
      </section>

      <section style={{ paddingBottom: 20 }}>
        <p className="t-label" style={{ margin: "0 0 8px" }}>
          Account
        </p>
        <DetailRow term="Plan">{planName(stylist.plan)}</DetailRow>
        <DetailRow term="Status">
          {ent.state === "trial"
            ? `trial, ${ent.daysLeft} days left`
            : ent.state === "subscribed"
              ? ent.status
              : ent.state === "past_due"
                ? "payment failed"
                : "lapsed"}
        </DetailRow>
        <DetailRow term="Booking page">{`/b/${stylist.handle}`}</DetailRow>
        <DetailRow term="Stripe payouts">
          {stylist.connectStatus === "active" ? "connected" : "not connected"}
        </DetailRow>
      </section>

      <section style={{ paddingBottom: 20 }}>
        <p className="t-label" style={{ margin: "0 0 8px" }}>
          You and your chair
        </p>
        <ProfileForm
          displayName={stylist.displayName}
          chairLocation={stylist.chairLocation ?? ""}
          bio={stylist.bio ?? ""}
          timezone={stylist.timezone}
        />
      </section>

      <section style={{ paddingBottom: 20 }}>
        <p className="t-label" style={{ margin: "0 0 8px" }}>
          Reminders and quiet hours
        </p>
        <NotifyForm
          reminder48h={settings.reminder48h}
          reminder2h={settings.reminder2h}
          nudgeGraceDays={settings.nudgeGraceDays}
          quietStartHour={settings.quietStartHour}
          quietEndHour={settings.quietEndHour}
        />
      </section>

      <section style={{ paddingBottom: 24 }}>
        <LogoutButton />
      </section>
    </>
  );
}

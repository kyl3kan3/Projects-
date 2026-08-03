import type { Metadata } from "next";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import {
  DEFAULT_SCAN_HOUR,
  DEFAULT_SCORE_THRESHOLD,
  firmSettings,
  users,
} from "@/db/schema";
import { requireFirm } from "@/lib/auth";
import { hasIcsToken } from "@/lib/ics";
import { checkSeat, formatPriceCents, plan } from "@/lib/plans";
import { formatDayYear } from "@/lib/format";
import { StatusPill } from "@/components/StatusPill";
import { Card, Download, MailFlat, SlackHash } from "@/components/icons";
import { ActionButton, IcsFeedPanel, InviteSeatForm, ScanSettingsForm } from "./SettingsForms";
import {
  icsFeedAction,
  inviteSeatAction,
  removeSeatAction,
  saveScanSettingsAction,
  sendScanNowAction,
  setSeatRoleAction,
  testSlackAction,
} from "./actions";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const { firm, user, access, planName } = await requireFirm();
  const db = getDb();
  const settings = firmSettings(firm);
  const seats = await db.select().from(users).where(eq(users.firmId, firm.id)).orderBy(users.createdAt);
  const seatCheck = checkSeat(access.planId, seats.length);
  const planned = plan(access.planId);
  const feedExists = await hasIcsToken(firm.id);
  const isAdmin = user.role === "admin";

  return (
    <main className="pt-4">
      <h1 className="t-h2">Settings</h1>
      <p className="t-secondary mt-2">
        {firm.name} · {planName}
        {access.planId !== "trial" ? ` · ${formatPriceCents(planned.priceCents)}/mo` : ""}
      </p>

      <section className="mt-8">
        <h2 className="t-label">The morning scan</h2>
        <div className="mt-3">
          <ScanSettingsForm
            action={saveScanSettingsAction}
            timezone={firm.timezone}
            scanHour={settings.scanHour ?? DEFAULT_SCAN_HOUR}
            scoreThreshold={settings.scoreThreshold ?? DEFAULT_SCORE_THRESHOLD}
            slackWebhookUrl={firm.slackWebhookUrl}
          />
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <div>
            <p className="t-secondary flex items-center gap-2">
              <MailFlat size={18} /> Email goes to all {seats.length} seat
              {seats.length === 1 ? "" : "s"}.
            </p>
            <div className="mt-2">
              <ActionButton
                action={sendScanNowAction}
                label="Send today's scan now"
                pendingLabel="Composing…"
              />
            </div>
          </div>
          <div>
            <p className="t-secondary flex items-center gap-2">
              <SlackHash size={18} />{" "}
              {firm.slackWebhookUrl ? "Slack webhook configured." : "No Slack webhook yet."}
            </p>
            <div className="mt-2">
              <ActionButton action={testSlackAction} label="Post a test to Slack" pendingLabel="Posting…" />
            </div>
          </div>
        </div>
        <p className="t-secondary mt-3">
          A no-new-matches morning still sends, in one line. Silence has to be distinguishable from
          breakage.
        </p>
      </section>

      <section className="mt-10" id="calendar">
        <h2 className="t-label">Calendar feed</h2>
        <p className="t-secondary mt-1">
          A signed, revocable URL your calendar polls. One VEVENT per open deadline; completing a date
          removes it. {feedExists ? "A feed URL exists for this firm." : "No feed has been created yet."}
        </p>
        {isAdmin ? (
          <div className="mt-3">
            <IcsFeedPanel action={icsFeedAction} exists={feedExists} />
          </div>
        ) : (
          <p className="t-secondary mt-3">Ask an admin for the feed URL.</p>
        )}
        <p className="t-secondary mt-2">
          Creating or rotating replaces any previous URL immediately, and both are audit-logged.
        </p>
      </section>

      <section className="mt-10">
        <h2 className="t-label">Seats</h2>
        <div className="rows mt-2">
          {seats.map((seat) => (
            <div key={seat.id} className="py-3 flex items-center gap-3" style={{ minHeight: 56 }}>
              <div className="min-w-0 flex-1">
                <p className="t-title truncate">{seat.name}</p>
                <p className="t-mono mt-1" style={{ color: "var(--color-ink-3)" }}>
                  {seat.email}
                </p>
              </div>
              <StatusPill
                label={seat.passwordHash ? seat.role : "invited"}
                tone={seat.passwordHash ? (seat.role === "admin" ? "accent" : "quiet") : "warn"}
                title={
                  seat.passwordHash
                    ? `Joined ${formatDayYear(seat.createdAt, firm.timezone)}`
                    : "Invitation not accepted yet — the seat is reserved"
                }
              />
              {isAdmin && (
                <div className="shrink-0 flex items-center gap-3">
                  <form action={setSeatRoleAction}>
                    <input type="hidden" name="userId" value={seat.id} />
                    <input
                      type="hidden"
                      name="role"
                      value={seat.role === "admin" ? "member" : "admin"}
                    />
                    <button className="btn-quiet" type="submit">
                      Make {seat.role === "admin" ? "member" : "admin"}
                    </button>
                  </form>
                  {!seat.passwordHash && (
                    <form action={removeSeatAction}>
                      <input type="hidden" name="userId" value={seat.id} />
                      <button className="btn-quiet" type="submit" style={{ color: "var(--color-ink-3)" }}>
                        Revoke
                      </button>
                    </form>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>

        {isAdmin && (
          <div className="mt-5">
            {seatCheck.allowed ? (
              <InviteSeatForm
                action={inviteSeatAction}
                seatsUsed={seats.length}
                seatLimit={seatCheck.limit}
              />
            ) : (
              <div className="card p-4">
                <p className="t-body">{seatCheck.message}</p>
                <Link href="/settings/billing" className="btn btn-primary w-full mt-3">
                  <Card size={20} /> Upgrade to add this seat
                </Link>
              </div>
            )}
          </div>
        )}
      </section>

      <section className="mt-10">
        <h2 className="t-label">Your data</h2>
        <p className="t-secondary mt-1">
          Export everything, any time, including in read-only mode. The anti-lock-in promise only
          counts if it holds when it is inconvenient.
        </p>
        <a href="/api/library/export" className="btn btn-secondary mt-3 w-full" download>
          <Download size={20} /> Export the answer library (JSON)
        </a>
      </section>

      <section className="mt-10">
        <h2 className="t-label">Billing</h2>
        <Link href="/settings/billing" className="btn btn-secondary mt-2 w-full">
          <Card size={20} /> Plans and payment
        </Link>
      </section>
    </main>
  );
}

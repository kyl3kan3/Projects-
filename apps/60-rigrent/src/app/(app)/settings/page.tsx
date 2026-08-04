import type { Metadata } from "next";
import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { AddUserForm, SettingsForm } from "./SettingsForms";
import { addUserAction, saveSettingsAction } from "./actions";
import { Placard } from "@/components/Placard";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { requireSession } from "@/lib/auth";
import { recentAudit } from "@/lib/audit";
import { formatInstant } from "@/lib/dates";
import { depositsAreSimulated } from "@/lib/deposit-gateway";
import { canAddUser, canWrite, entitlements, overflowUsers, PLANS } from "@/lib/plans";
import { parseSettings } from "@/lib/settings";
import { env } from "@/lib/env";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const { account, user } = await requireSession();
  const ent = entitlements(account);
  const settings = parseSettings(account.settings);
  const db = getDb();

  const [team, log] = await Promise.all([
    db.select().from(users).where(eq(users.accountId, account.id)).orderBy(asc(users.createdAt)),
    recentAudit(account.id, 20),
  ]);

  const seatGate = canAddUser(ent, team.length);
  const writeGate = canWrite(ent);
  const overflow = new Set(overflowUsers(ent, team).map((u) => u.id));

  return (
    <main style={{ paddingBottom: 40, maxWidth: 560 }}>
      <h1 className="t-h2">Settings</h1>
      <p className="t-secondary" style={{ marginTop: 4 }}>
        Deposit defaults, tax, the fee schedule every new item starts from, and the terms your
        contracts print.
      </p>

      <div className="panel" style={{ marginTop: 20, padding: 16 }}>
        <div className="between">
          <div>
            <p className="t-label">Plan</p>
            <p className="t-title" style={{ marginTop: 4 }}>
              {PLANS[ent.plan].name}
              {ent.trialing ? ` · ${ent.trialDaysLeft} days left` : ""}
            </p>
          </div>
          <Link href="/settings/billing" className="btn-quiet">
            Billing
          </Link>
        </div>
        <p className="t-secondary" style={{ marginTop: 8 }}>
          {PLANS[ent.plan].blurb}
        </p>
      </div>

      {depositsAreSimulated() ? (
        <div className="banner" data-tone="warn" style={{ marginTop: 16 }}>
          <strong>Deposit holds are simulated.</strong> No Stripe key is configured, so nothing this
          app does can touch a real card. Every hold, capture and release is recorded and audited as
          if it were live, and every screen showing one says &ldquo;simulated&rdquo;.
        </div>
      ) : null}

      <section style={{ marginTop: 32 }}>
        <h2 className="t-label">The yard</h2>
        <div style={{ marginTop: 12 }}>
          <SettingsForm
            action={saveSettingsAction}
            yardName={account.name}
            timezone={account.timezone}
            settings={settings}
            disabled={!writeGate.allowed || user.role !== "owner"}
            disabledReason={
              user.role !== "owner"
                ? "Only the owner can change deposit, tax and fee defaults."
                : writeGate.reason
            }
          />
        </div>
      </section>

      <section style={{ marginTop: 32 }}>
        <div className="between">
          <h2 className="t-label">Team</h2>
          <span className="t-mono tone-dim">
            {team.length}/
            {Number.isFinite(PLANS[ent.plan].users) ? PLANS[ent.plan].users : "∞"} seats
          </span>
        </div>
        <div className="stack" style={{ marginTop: 8 }}>
          {team.map((member) => (
            <div key={member.id} className="row">
              <div style={{ flex: 1, minWidth: 0 }}>
                <p className="t-title">{member.name}</p>
                <p className="t-secondary" style={{ marginTop: 2 }}>
                  {member.email}
                </p>
              </div>
              <Placard
                label={overflow.has(member.id) ? `${member.role} · over cap` : member.role}
                tone={overflow.has(member.id) ? "warn" : "dim"}
              />
            </div>
          ))}
        </div>
        {overflow.size > 0 ? (
          <p className="t-secondary tone-warn" style={{ marginTop: 8 }}>
            {overflow.size} teammate{overflow.size === 1 ? "" : "s"} sit past this plan&rsquo;s seat
            cap. Nothing has been deleted; upgrade or remove a seat and they are back.
          </p>
        ) : null}
        <div style={{ marginTop: 20 }}>
          <AddUserForm
            action={addUserAction}
            disabled={!seatGate.allowed || user.role !== "owner"}
            disabledReason={
              user.role !== "owner" ? "Only the owner can add teammates." : seatGate.reason
            }
          />
        </div>
      </section>

      <section style={{ marginTop: 32 }}>
        <h2 className="t-label">Recent activity</h2>
        <p className="t-secondary" style={{ marginTop: 4 }}>
          Deposit captures, waives, contract signatures and inventory count edits are always logged —
          they are the four a customer&rsquo;s lawyer asks about.
        </p>
        {log.length === 0 ? (
          <p className="t-secondary" style={{ marginTop: 8 }}>
            Nothing logged yet.
          </p>
        ) : (
          <div className="stack" style={{ marginTop: 8 }}>
            {log.map((entry) => (
              <div key={entry.id} className="row">
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p className="t-mono">{entry.action}</p>
                  <p className="t-secondary" style={{ marginTop: 2 }}>
                    {entry.actor}
                  </p>
                </div>
                <span className="t-mono tone-dim">{formatInstant(entry.createdAt)}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section style={{ marginTop: 32 }}>
        <h2 className="t-label">Environment</h2>
        <div className="stack" style={{ marginTop: 8 }}>
          <Fact label="Deposit gateway" value={depositsAreSimulated() ? "simulated" : "Stripe Connect"} />
          <Fact label="Photo storage" value={env.storageDriver} />
          <Fact label="Email" value={env.dryRun || !env.resendApiKey ? "dry run (logged)" : "Resend"} />
          <Fact
            label="Background work"
            value={process.env.REDIS_URL ? "BullMQ worker" : "cron route (/api/cron/tick)"}
          />
        </div>
      </section>
    </main>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="row">
      <span className="t-secondary" style={{ flex: 1 }}>
        {label}
      </span>
      <span className="t-mono">{value}</span>
    </div>
  );
}

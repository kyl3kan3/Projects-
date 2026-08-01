import type { Metadata } from "next";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { ROLE_LABEL, canAdminister, requireUser, suggestPassword } from "@/lib/auth";
import { ActionForm } from "@/components/ActionForm";
import { IconGear } from "@/components/icons";
import { PLANS, canAddSeat } from "@/lib/plans";
import { stampDate } from "@/lib/format";
import { recentAudit } from "@/lib/audit";
import { addSeatAction, removeSeatAction, updateCompanyAction } from "./actions";
import { logoutAction } from "../../(auth)/actions";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const { company, user } = await requireUser();
  const db = getDb();
  const seats = await db.select().from(users).where(eq(users.companyId, company.id));
  const admin = canAdminister(user.role);
  const seatGate = canAddSeat(company.plan, seats.length);
  const trail = await recentAudit(company.id, 25);

  return (
    <main className="wrap">
      <header className="gutter" style={{ paddingBlock: "var(--s5)" }}>
        <h1 className="t-h2">
          <IconGear size={20} /> Settings
        </h1>
      </header>

      {/* ---------------------------------------------------------- company --- */}
      <section className="gutter">
        <h2 className="t-label">Company</h2>
        <div style={{ marginTop: "var(--s4)" }}>
          <ActionForm action={updateCompanyAction} submitLabel="Save">
            <label className="field">
              <span className="t-label">Name — subs see this on every invite</span>
              <input className="input" name="name" defaultValue={company.name} maxLength={160} />
            </label>
            <label className="field">
              <span className="t-label">Reply-to for sub emails</span>
              <input
                className="input"
                name="replyTo"
                type="email"
                defaultValue={company.replyToEmail ?? ""}
                placeholder="estimating@fultonbuild.com"
              />
              <span className="t-secondary">
                When a sub hits reply on an invite, this is where it lands. Half of bidding still
                happens by email; that is fine, as long as it reaches the right person.
              </span>
            </label>
            <label className="field">
              <span className="t-label">Reminder schedule (days before the bid date)</span>
              <input
                className="input"
                name="reminderDays"
                defaultValue={company.settings.reminderDays.join(", ")}
                placeholder="7, 3, 1"
              />
              <span className="t-secondary">
                Each rung fires once per bidder and nothing fires after the date passes. A sub
                invited four days out gets the 3- and 1-day nudges, never a back-dated 7.
              </span>
            </label>
            <label className="field">
              <span className="t-label">Note on the bid portal</span>
              <textarea
                className="textarea"
                name="portalNote"
                defaultValue={company.settings.portalNote ?? ""}
                maxLength={500}
                placeholder="Questions by Thursday please. We award within a week of the bid date."
              />
            </label>
          </ActionForm>
        </div>
      </section>

      {/* ------------------------------------------------------------- seats --- */}
      <section className="hairline-t" style={{ marginTop: "var(--s6)", paddingTop: "var(--s5)" }}>
        <div
          className="gutter"
          style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}
        >
          <h2 className="t-label">Seats</h2>
          <span className="t-data" style={{ color: "var(--fg-3)" }}>
            {seats.length} / {PLANS[company.plan].seats}
          </span>
        </div>
        <p className="gutter t-secondary" style={{ marginTop: "var(--s2)" }}>
          Seats are your people. Subs are never seats and never pay — that is the whole adoption
          wedge. A viewer can read everything, including the leveling grid, and change nothing.
        </p>

        <div className="rows" style={{ marginTop: "var(--s4)" }}>
          {seats.map((seat) => (
            <div key={seat.id} className="row gutter">
              <div className="stack" style={{ gap: 2, flex: 1, minWidth: 0 }}>
                <span className="t-title" style={{ fontSize: 15 }}>
                  {seat.name ?? seat.email}
                </span>
                <span className="t-secondary" style={{ fontSize: 12 }}>
                  {seat.email} · {ROLE_LABEL[seat.role]} · joined {stampDate(seat.createdAt)}
                  {seat.id === user.id ? " · you" : ""}
                </span>
              </div>
              {admin && seat.id !== user.id ? (
                <ActionForm
                  action={removeSeatAction}
                  submitLabel="Remove"
                  variant="quiet"
                  compact
                  confirm={`Remove ${seat.email}? They lose access immediately. Nothing they created is deleted.`}
                  hiddenFields={{ userId: seat.id }}
                />
              ) : null}
            </div>
          ))}
        </div>

        {admin ? (
          <details className="gutter" style={{ marginTop: "var(--s5)" }}>
            <summary className="btn-quiet">Add a seat</summary>
            <div style={{ marginTop: "var(--s4)" }}>
              {!seatGate.allowed ? (
                <div className="notice notice-bad" style={{ marginBottom: "var(--s4)" }}>
                  {seatGate.reason}{" "}
                  <Link className="link" href="/settings/billing">
                    See plans
                  </Link>
                </div>
              ) : null}
              <ActionForm action={addSeatAction} submitLabel="Add seat" disabled={!seatGate.allowed}>
                <label className="field">
                  <span className="t-label">Name</span>
                  <input className="input" name="name" maxLength={120} placeholder="Marisol Vega" />
                </label>
                <label className="field">
                  <span className="t-label">Email</span>
                  <input className="input" name="email" type="email" required />
                </label>
                <label className="field">
                  <span className="t-label">Role</span>
                  <select className="select" name="role" defaultValue="estimator">
                    <option value="estimator">Estimator — can invite, level and award</option>
                    <option value="viewer">Viewer — reads everything, changes nothing</option>
                    <option value="admin">Admin — also billing and seats</option>
                  </select>
                </label>
                <label className="field">
                  <span className="t-label">Starting password</span>
                  <input
                    className="input"
                    name="password"
                    minLength={8}
                    required
                    defaultValue={suggestPassword()}
                  />
                  <span className="t-secondary">
                    Read it out to them; they can change it later. There is no invite email for
                    seats — one fewer thing to get lost in a spam folder.
                  </span>
                </label>
              </ActionForm>
            </div>
          </details>
        ) : null}
      </section>

      {/* ----------------------------------------------------------- billing --- */}
      <section className="hairline-t" style={{ marginTop: "var(--s6)", paddingTop: "var(--s5)" }}>
        <h2 className="t-label gutter">Plan</h2>
        <p className="gutter t-secondary" style={{ marginTop: "var(--s2)" }}>
          On {PLANS[company.plan].name}: {PLANS[company.plan].blurb}
        </p>
        <div className="gutter" style={{ marginTop: "var(--s4)" }}>
          <Link href="/settings/billing" className="btn btn-secondary">
            Plans and billing
          </Link>
        </div>
      </section>

      {/* ------------------------------------------------------- audit trail --- */}
      <section className="hairline-t" style={{ marginTop: "var(--s6)", paddingTop: "var(--s5)" }}>
        <h2 className="t-label gutter">Audit trail</h2>
        <p className="gutter t-secondary" style={{ marginTop: "var(--s2)" }}>
          Every bid view, portal open, plan download and award. Bid-shopping accusations are
          radioactive in this business; this is the answer to one.
        </p>
        {trail.length === 0 ? (
          <p className="gutter t-secondary" style={{ marginTop: "var(--s3)", color: "var(--fg-3)" }}>
            Nothing recorded yet.
          </p>
        ) : (
          <div className="rows" style={{ marginTop: "var(--s4)" }}>
            {trail.map((row) => (
              <div key={row.id} className="row gutter" style={{ minHeight: 44 }}>
                <span className="t-data" style={{ color: "var(--fg-3)", flex: "none", width: 72 }}>
                  {stampDate(row.createdAt)}
                </span>
                <span className="t-secondary" style={{ flex: 1, minWidth: 0 }}>
                  <strong style={{ fontWeight: 600 }}>{row.action}</strong> · {row.actorLabel}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="hairline-t" style={{ marginTop: "var(--s6)", paddingTop: "var(--s5)" }}>
        <form action={logoutAction} className="gutter">
          <button type="submit" className="btn btn-secondary btn-full">
            Sign out
          </button>
        </form>
      </section>
    </main>
  );
}

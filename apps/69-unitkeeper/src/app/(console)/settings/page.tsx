import type { Metadata } from "next";
import Link from "next/link";
import { SettingsForm } from "@/app/(console)/settings/SettingsForm";
import { NewFacilityForm } from "@/app/(console)/map/NewFacilityForm";
import { requireOwner } from "@/lib/auth";
import { recentAudit } from "@/lib/audit";
import { canAddFacility } from "@/lib/plans";
import { ladderPlacards, readSettings } from "@/lib/settings";
import { facilitiesFor } from "@/lib/units";
import { REVIEWED_STATES } from "@/lib/lien-rules";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const { owner, ent } = await requireOwner();
  const settings = readSettings(owner.settings);
  const ownerFacilities = await facilitiesFor(owner.id);
  const gate = canAddFacility(ent, ownerFacilities.length);
  const log = await recentAudit(owner.id, 20);

  return (
    <main style={{ padding: "20px 20px 40px", maxWidth: 680 }}>
      <h1 className="t-h2">Settings</h1>
      <p className="t-secondary" style={{ marginTop: 4 }}>
        {owner.email} · {ent.spec.name}
        {ent.trialing ? ` · ${ent.trialDaysLeft} trial day${ent.trialDaysLeft === 1 ? "" : "s"} left` : ""}{" "}
        · <Link href="/settings/billing">Billing</Link>
      </p>

      <p className="t-mono" style={{ marginTop: 16, color: "var(--color-dim)" }}>
        {ladderPlacards(settings).join("  ·  ")}
      </p>

      <section className="hairline-t" style={{ marginTop: 24, paddingTop: 20 }}>
        <h2 className="t-label">Facility and money rules</h2>
        <div style={{ marginTop: 16 }}>
          <SettingsForm settings={settings} />
        </div>
      </section>

      <section className="hairline-t" style={{ marginTop: 24, paddingTop: 20 }}>
        <h2 className="t-label">Facilities</h2>
        <ul style={{ listStyle: "none", padding: 0, marginTop: 8 }}>
          {ownerFacilities.map((facility) => (
            <li className="row" key={facility.id}>
              <span style={{ flex: 1 }}>
                <span className="t-title">{facility.name}</span>
                <br />
                <span className="t-secondary">
                  {facility.state}
                  {REVIEWED_STATES.includes(facility.state)
                    ? " · lien rules reviewed"
                    : " · manual lien mode"}
                  {facility.gateSystem ? ` · ${facility.gateSystem}` : ""}
                </span>
              </span>
              <Link className="btn-quiet" href={`/map?facility=${facility.id}`}>
                Map
              </Link>
            </li>
          ))}
        </ul>
        {gate.allowed ? (
          <details style={{ marginTop: 16 }}>
            <summary className="btn-quiet" style={{ minHeight: 44, display: "inline-flex" }}>
              Add a facility
            </summary>
            <div style={{ marginTop: 16 }}>
              <NewFacilityForm />
            </div>
          </details>
        ) : (
          <p className="field-help" style={{ marginTop: 12 }}>
            {gate.reason}
          </p>
        )}
      </section>

      <section className="hairline-t" style={{ marginTop: 24, paddingTop: 20 }}>
        <h2 className="t-label">Audit log</h2>
        <p className="t-secondary" style={{ marginTop: 4 }}>
          Lien steps, gate-code changes and ledger corrections, newest first.
        </p>
        {log.length === 0 ? (
          <p className="t-secondary" style={{ marginTop: 12 }}>
            Nothing recorded yet.
          </p>
        ) : (
          <ul style={{ listStyle: "none", padding: 0, marginTop: 12 }}>
            {log.map((entry) => (
              <li
                key={entry.id}
                className="t-mono"
                style={{ color: "var(--color-dim)", padding: "4px 0" }}
              >
                {entry.createdAt.toISOString().slice(0, 16).replace("T", " ")} · {entry.action} ·{" "}
                {entry.actor}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

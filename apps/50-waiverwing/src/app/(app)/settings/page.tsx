import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { featureAllowed, locationsAllowed, plan } from "@/lib/plans";
import { monthlyVolume, offlineSyncedCount } from "@/lib/signatures";
import { AccountSettingsForm, AddLocationForm, LocationForm } from "./SettingsForms";
import { LogoutButton } from "./LogoutButton";
import { ExportPanel } from "./ExportPanel";
import { localDateString } from "@/lib/time";

export const metadata: Metadata = { title: "Settings" };
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const { account, locations, location } = await requireUser();
  const spec = plan(account.plan);
  const volume = await monthlyVolume(account.id);
  const offlineSynced = await offlineSyncedCount(account.id);
  const today = localDateString(new Date(), location.timezone);

  return (
    <div className="px-5 lg:px-0">
      <h1 className="t-h2 pt-6">Settings</h1>

      <p className="t-label mt-8">Plan</p>
      <div className="mt-2">
        <div className="hairline-b flex items-center justify-between gap-4 py-3">
          <span className="t-secondary">Current</span>
          <span className="t-data">{spec.name.toUpperCase()}</span>
        </div>
        <div className="hairline-b flex items-center justify-between gap-4 py-3">
          <span className="t-secondary">Waivers this month</span>
          <span className="t-data">
            {volume} / {spec.waiversPerMonth}
          </span>
        </div>
        <div className="hairline-b flex items-center justify-between gap-4 py-3">
          <span className="t-secondary">Signed offline and synced</span>
          <span className="t-data">{offlineSynced}</span>
        </div>
      </div>
      <Link href="/settings/billing" className="btn btn-secondary mt-4">
        Billing and plans
      </Link>

      <p className="t-label mt-10">Kiosk</p>
      <p className="t-secondary mt-2">
        Open this on the counter tablet, enter the PIN, and add it to the home screen. It runs
        full-screen, resets itself between signers, and keeps signing when the Wi-Fi drops.
      </p>
      <div className="mt-3 flex flex-wrap gap-3">
        <Link href={`/kiosk/${location.id}`} className="btn btn-primary">
          Open kiosk mode
        </Link>
        <Link href="/settings/poster" className="btn btn-secondary">
          QR poster
        </Link>
      </div>
      {!featureAllowed(account, "kiosk") ? (
        <p className="t-secondary mt-3" style={{ color: "var(--color-ember)" }}>
          Kiosk mode is part of Front Desk. The QR poster works on every plan.
        </p>
      ) : null}

      <p className="t-label mt-10">Locations</p>
      {locations.map((l) => (
        <div key={l.id} className="hairline-b py-5">
          <p className="t-title">{l.name}</p>
          <LocationForm location={l} />
        </div>
      ))}
      <AddLocationForm allowed={locationsAllowed(account)} current={locations.length} />

      <p className="t-label mt-10">Records and retention</p>
      <AccountSettingsForm
        settings={account.settings}
        canRemoveFooter={featureAllowed(account, "removablePosterFooter")}
      />

      <p className="t-label mt-10">Export for counsel or an insurer</p>
      <ExportPanel
        locations={locations.map((l) => ({ id: l.id, name: l.name }))}
        today={today}
        canCsv={featureAllowed(account, "csvExport")}
      />

      <div className="mt-10">
        <LogoutButton />
      </div>
    </div>
  );
}

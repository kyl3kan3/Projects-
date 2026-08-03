import type { Metadata } from "next";
import Link from "next/link";
import { Empty, Pill, ScreenTitle, SectionHead } from "@/components/ui";
import { requireSchool } from "@/lib/auth";
import { listDevices } from "@/lib/kiosk";
import { formatDate } from "@/lib/time";
import { KioskForms } from "./KioskForms";

export const metadata: Metadata = { title: "Kiosk devices" };

export default async function KioskSettingsPage() {
  const { school, user } = await requireSchool();
  const devices = await listDevices(school.id);
  const active = devices.filter((d) => d.status === "active");
  const revoked = devices.filter((d) => d.status === "revoked");

  return (
    <main className="screen">
      <ScreenTitle
        eyebrow="The door tablets"
        title="Kiosk devices"
        action={
          <Link href="/settings" className="btn-quiet">
            Settings
          </Link>
        }
      />
      <p className="t-secondary">
        A kiosk holds one signed device token and nothing else — no staff credential is reachable from
        the mat. Revoking a device kills it immediately, even mid-session, because the token is
        checked against this row on every request.
      </p>

      {active.length === 0 ? (
        <Empty
          title="No active devices"
          body="Mint a link, open it once on the tablet, and add it to the home screen. The link is shown only at the moment it is created."
        />
      ) : (
        <>
          <SectionHead>Active</SectionHead>
          <div>
            {active.map((device) => (
              <div key={device.id} className="row">
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p className="t-title">{device.name}</p>
                  <p className="t-data fg-3" style={{ marginTop: 2 }}>
                    {device.lastSeenAt
                      ? `last check-in ${formatDate(device.lastSeenAt, school.timezone)}`
                      : "not used yet"}
                  </p>
                </div>
                <Pill tone="ok">Active</Pill>
              </div>
            ))}
          </div>
        </>
      )}

      <KioskForms
        canManage={user.role !== "front_desk"}
        devices={active.map((d) => ({ id: d.id, name: d.name }))}
      />

      {revoked.length > 0 ? (
        <>
          <SectionHead>Revoked</SectionHead>
          <div>
            {revoked.map((device) => (
              <div key={device.id} className="row">
                <div style={{ flex: 1 }}>
                  <p className="t-secondary">{device.name}</p>
                </div>
                <Pill tone="quiet">Revoked</Pill>
              </div>
            ))}
          </div>
        </>
      ) : null}
    </main>
  );
}

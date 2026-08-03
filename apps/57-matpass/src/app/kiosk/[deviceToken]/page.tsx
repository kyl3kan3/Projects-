/**
 * src/app/kiosk/[deviceToken]/page.tsx
 *
 * The door tablet. A single-purpose surface: no tab bar, no navigation, no way
 * to reach the console, and no staff credential anywhere near it.
 *
 * The token in the URL is verified server-side on load and again on every
 * request the client makes. A revoked device sees a dead-end screen instead of
 * the search field, which is the whole point of the device-token model.
 */

import type { Metadata } from "next";
import { IconBeltBar } from "@/components/icons";
import { verifyDeviceToken } from "@/lib/kiosk";
import { Kiosk } from "./Kiosk";

export const metadata: Metadata = {
  title: "Check in",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function KioskPage({
  params,
}: {
  params: Promise<{ deviceToken: string }>;
}) {
  const { deviceToken } = await params;
  const device = await verifyDeviceToken(deviceToken);

  if (!device) {
    return (
      <main className="world-kiosk screen-narrow" style={{ paddingTop: 80 }}>
        <span className="fg-3">
          <IconBeltBar size={26} />
        </span>
        <h1 className="t-h2" style={{ marginTop: 16 }}>
          This kiosk is not active
        </h1>
        <p className="t-body fg-2" style={{ marginTop: 12 }}>
          The device token has been revoked or was never valid. Ask the front desk for a new kiosk
          link — nothing else can be done from this screen, by design.
        </p>
      </main>
    );
  }

  return (
    <Kiosk
      token={deviceToken}
      deviceName={device.deviceName}
    />
  );
}

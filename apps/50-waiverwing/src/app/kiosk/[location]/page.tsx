import type { Metadata } from "next";
import { getKioskSession, locationForKiosk } from "@/lib/auth";
import { resolveSignToken } from "@/lib/qr";
import { expiryRuleLabel, signatureConfig } from "@/lib/waivers";
import { todayBoard } from "@/lib/checkin";
import { KioskShell } from "@/components/KioskShell";
import { KioskUnlock } from "./KioskUnlock";
import { Blaze } from "@/components/Blaze";
import { getDb } from "@/db";
import { accounts } from "@/db/schema";
import { eq } from "drizzle-orm";
import { featureAllowed } from "@/lib/plans";

export const metadata: Metadata = {
  title: "Kiosk",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

export default async function KioskPage({ params }: { params: Promise<{ location: string }> }) {
  const { location: locationId } = await params;
  const location = await locationForKiosk(locationId);

  if (!location) {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-[420px] flex-col justify-center px-5">
        <Blaze size={40} draw={false} />
        <h1 className="t-h2 mt-6">That kiosk address is not in use.</h1>
        <p className="t-body mt-3" style={{ color: "var(--color-text-2)" }}>
          Open Settings on the staff dashboard and use the kiosk link for this location.
        </p>
      </main>
    );
  }

  const session = await getKioskSession(location.id);
  if (!session) {
    return <KioskUnlock locationId={location.id} venueName={location.name} />;
  }

  const db = getDb();
  const [account] = await db.select().from(accounts).where(eq(accounts.id, location.accountId));
  if (account && !featureAllowed(account, "kiosk")) {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-[480px] flex-col justify-center px-5">
        <Blaze size={40} draw={false} />
        <h1 className="t-h2 mt-6">Kiosk mode is part of Front Desk.</h1>
        <p className="t-body mt-3" style={{ color: "var(--color-text-2)" }}>
          The QR poster works on every plan — customers can still sign on their own phones at the
          counter while you decide.
        </p>
      </main>
    );
  }

  const resolved = await resolveSignToken(location.qrToken);
  if (resolved.kind !== "ok") {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-[480px] flex-col justify-center px-5">
        <Blaze size={40} draw={false} />
        <h1 className="t-h2 mt-6">No waiver is published for this location.</h1>
        <p className="t-body mt-3" style={{ color: "var(--color-text-2)" }}>
          Publish one from the Waivers screen and reload this tablet.
        </p>
      </main>
    );
  }

  const version = resolved.version;
  const sigConfig = signatureConfig(version.bodyBlocks);
  const board = await todayBoard(location);

  return (
    <KioskShell
      signedToday={board.signedCount}
      signProps={{
        token: location.qrToken,
        versionId: version.id,
        venueName: location.name,
        waiverTitle: version.title,
        waiverVersion: version.version,
        blocks: version.bodyBlocks,
        disclosure: sigConfig.disclosure,
        allowDrawn: sigConfig.allowDrawn,
        ageOfMajority: version.minorRule.ageOfMajority,
        relationshipOptions: version.minorRule.relationshipOptions,
        expiryLabel: expiryRuleLabel(version.expiryRule),
      }}
    />
  );
}

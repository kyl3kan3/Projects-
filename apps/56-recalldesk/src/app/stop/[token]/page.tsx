import type { Metadata } from "next";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { patients } from "@/db/schema";
import { Icon } from "@/components/icons";
import { verifyStopToken } from "@/lib/tokens";
import { optOutPatient } from "@/server/campaigns";

/**
 * Email unsubscribe. One GET, no confirmation step, no "are you sure" — a person
 * who clicked unsubscribe has already decided, and a second click is a spam
 * complaint. The token never expires for the same reason.
 *
 * It is honoured immediately and permanently: `email_opted_out_at` is set, the
 * consent flag is cleared, active enrolments stop, and no future import can undo
 * any of it.
 */
export const metadata: Metadata = {
  title: "Unsubscribed",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

export default async function StopPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const payload = await verifyStopToken(token);

  if (!payload) {
    return (
      <Shell title="This link is not valid">
        We could not read that unsubscribe link. Reply to the email you received and the practice will
        take you off their recall list by hand.
      </Shell>
    );
  }

  const db = getDb();
  const [patient] = await db.select().from(patients).where(eq(patients.id, payload.patientId));
  if (!patient) {
    return (
      <Shell title="Nothing to unsubscribe">
        That record no longer exists, so there is nothing left to send you.
      </Shell>
    );
  }

  if (!patient.emailOptedOutAt) {
    await optOutPatient({ patientId: patient.id, channel: "email" });
  }

  return (
    <Shell title="Unsubscribed" tone="green">
      You will not receive recall emails from this practice again. This is permanent — a future roster
      import cannot undo it.
      <br />
      <br />
      Your dental records are unaffected, and you are welcome to book any time by calling the practice.
    </Shell>
  );
}

function Shell({
  title,
  tone,
  children,
}: {
  title: string;
  tone?: "green";
  children: React.ReactNode;
}) {
  return (
    <main className="screen" style={{ paddingTop: 32, paddingBottom: 40, maxWidth: 520 }}>
      <p className="t-label" style={{ margin: 0 }}>
        RecallDesk
      </p>
      <h1 className="t-h2" style={{ margin: "8px 0 12px", display: "flex", alignItems: "center", gap: 8 }}>
        {tone === "green" && (
          <span style={{ color: "var(--color-green)", lineHeight: 0 }}>
            <Icon name="check-seat" size={22} />
          </span>
        )}
        {title}
      </h1>
      <p className="t-body" style={{ marginTop: 0 }}>
        {children}
      </p>
    </main>
  );
}

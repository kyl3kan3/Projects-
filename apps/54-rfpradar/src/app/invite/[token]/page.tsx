import type { Metadata } from "next";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { firms } from "@/db/schema";
import { findInvite } from "@/lib/auth";
import { AuthForm } from "../../(auth)/AuthForm";
import { acceptInviteAction } from "../../(auth)/actions";
import { RadarArc } from "@/components/icons";

export const metadata: Metadata = { title: "Accept your seat" };

export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const user = await findInvite(token);

  return (
    <main className="screen pt-10" style={{ maxWidth: 480 }}>
      <Link
        href="/"
        className="flex items-center gap-2"
        style={{ color: "var(--color-ink)", textDecoration: "none" }}
      >
        <RadarArc size={22} />
        <span className="t-label" style={{ color: "var(--color-ink-2)" }}>
          RFPRadar
        </span>
      </Link>

      {!user ? (
        <>
          <h1 className="t-h2 mt-8">That invitation is no longer valid</h1>
          <p className="t-body mt-2" style={{ color: "var(--color-ink-2)" }}>
            Invitation links are single-use, and an admin can revoke one by
            re-inviting the seat. Ask whoever invited you to send a fresh link.
          </p>
          <Link href="/login" className="btn btn-secondary mt-6 w-full">
            Sign in instead
          </Link>
        </>
      ) : (
        <>
          <h1 className="t-h2 mt-8">Set your password</h1>
          <p className="t-body mt-2" style={{ color: "var(--color-ink-2)" }}>
            Then you are in: scored tenders every morning, the shared deadline
            calendar, and the firm&apos;s answer library.
          </p>
          <div className="mt-8">
            <AuthForm
              action={acceptInviteAction}
              mode="invite"
              token={token}
              inviteEmail={user.email}
              firmName={await firmNameFor(user.firmId)}
            />
          </div>
        </>
      )}
    </main>
  );
}

async function firmNameFor(firmId: string): Promise<string> {
  const [firm] = await getDb().select({ name: firms.name }).from(firms).where(eq(firms.id, firmId));
  return firm?.name ?? "your firm";
}

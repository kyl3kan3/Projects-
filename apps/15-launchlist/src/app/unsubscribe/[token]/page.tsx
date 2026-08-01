import type { Metadata } from "next";
import Link from "next/link";
import { readUnsubscribeToken } from "@/lib/tokens";
import { env } from "@/lib/env";
import { signupById, unsubscribeSignup } from "@/lib/signups";
import { listById } from "@/lib/lists";
import { Wordmark } from "@/components/icons";

/**
 * One-click unsubscribe. Honoured immediately on GET, with no confirmation step:
 * an unsubscribe that needs a second click is a dark pattern, and mail clients
 * fetching a `List-Unsubscribe` URL expect the action to have happened.
 *
 * The position in line is kept — see `unsubscribeSignup`.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Unsubscribed",
  robots: { index: false, follow: false },
};

export default async function UnsubscribePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const signupId = readUnsubscribeToken(token, env.authSecret);

  let listName: string | null = null;
  let position = 0;
  let ok = false;

  if (signupId) {
    const existing = await signupById(signupId);
    if (existing) {
      const list = await listById(existing.listId);
      listName = list?.name ?? null;
      const updated = await unsubscribeSignup(signupId);
      position = (updated ?? existing).position;
      ok = existing.status === "unsubscribed" || Boolean(updated);
    }
  }

  return (
    <main
      className="page-column"
      style={{ minHeight: "100dvh", display: "flex", flexDirection: "column", justifyContent: "center" }}
    >
      <Wordmark />
      {ok ? (
        <>
          <h1 className="t-h2" style={{ marginTop: 24 }}>
            You&apos;re unsubscribed.
          </h1>
          <p className="t-body" style={{ marginTop: 12, color: "var(--color-text-2)" }}>
            No more email about {listName ?? "this list"}. You keep your place in line
            {position > 0 ? ` — you're still #${position}` : ""}: you earned it, and removing it
            would quietly move everyone else.
          </p>
          <p className="t-secondary" style={{ marginTop: 16 }}>
            This was done immediately, with no second click. If you unsubscribed by accident, the
            founder can put you back on the list.
          </p>
        </>
      ) : (
        <>
          <h1 className="t-h2" style={{ marginTop: 24 }}>
            That unsubscribe link isn&apos;t valid.
          </h1>
          <p className="t-body" style={{ marginTop: 12, color: "var(--color-text-2)" }}>
            It may have been truncated by your mail client. Reply to the email you received and ask
            to be removed — that always works.
          </p>
        </>
      )}
      <p className="t-secondary" style={{ marginTop: 24 }}>
        <Link href="/">What is LaunchList?</Link>
      </p>
    </main>
  );
}

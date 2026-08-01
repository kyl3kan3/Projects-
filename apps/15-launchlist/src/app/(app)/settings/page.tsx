import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { countLists } from "@/lib/lists";
import { limitLabel, plan } from "@/lib/plans";
import { emailConfigured } from "@/lib/email";
import { isoDate } from "@/lib/format";
import { logoutAction } from "@/app/(auth)/actions";
import { IconChevronRight, Wordmark } from "@/components/icons";

export const metadata: Metadata = { title: "Account" };
export const dynamic = "force-dynamic";

export default async function AccountSettingsPage() {
  const user = await requireUser();
  const limits = plan(user.plan);
  const lists = await countLists(user.id);

  return (
    <main className="screen">
      <header style={{ paddingTop: 32, paddingBottom: 24 }}>
        <Wordmark />
        <h1 className="t-h2" style={{ marginTop: 24 }}>
          Account
        </h1>
        <p className="t-secondary" style={{ marginTop: 4 }}>
          {user.email} · joined {isoDate(user.createdAt)}
        </p>
      </header>

      <ul>
        <li>
          <Link href="/lists" className="row" style={{ color: "inherit" }}>
            <span style={{ flex: 1 }}>
              <span className="t-title" style={{ display: "block" }}>
                Your lists
              </span>
              <span className="t-secondary">
                {lists} of {limitLabel(limits.lists)} on {limits.name}
              </span>
            </span>
            <IconChevronRight size={18} />
          </Link>
        </li>
        <li>
          <Link href="/settings/billing" className="row" style={{ color: "inherit" }}>
            <span style={{ flex: 1 }}>
              <span className="t-title" style={{ display: "block" }}>
                Plan and billing
              </span>
              <span className="t-secondary">
                {limits.name}
                {limits.priceMonthly ? ` · $${limits.priceMonthly}/mo` : " · free"}
              </span>
            </span>
            <IconChevronRight size={18} />
          </Link>
        </li>
      </ul>

      <section className="hairline-t" style={{ marginTop: 32, paddingTop: 24 }}>
        <p className="t-label">Email delivery</p>
        <p className="t-secondary" style={{ marginTop: 8 }}>
          {emailConfigured()
            ? "A provider is configured. Confirmation links, reward unlocks and blasts are delivered."
            : "No provider is configured on this deployment. Confirmation links and blasts are written to the server log instead of being delivered — set RESEND_API_KEY to send real mail."}
        </p>
      </section>

      <form action={logoutAction} style={{ marginTop: 32 }}>
        <button type="submit" className="btn btn-secondary btn-full">
          Sign out
        </button>
      </form>
    </main>
  );
}

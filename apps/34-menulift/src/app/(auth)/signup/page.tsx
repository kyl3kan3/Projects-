import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthForm } from "../AuthForm";
import { getSession } from "@/lib/auth";
import { PLANS, TRIAL_DAYS } from "@/lib/plans";
import { money } from "@/lib/format";

export const metadata: Metadata = { title: "Start a trial" };

export default async function SignupPage() {
  if (await getSession()) redirect("/menu");
  return (
    <main className="screen" style={{ maxWidth: 460, margin: "0 auto", paddingBottom: 56 }}>
      <header style={{ paddingTop: 40, paddingBottom: 24 }}>
        <Link href="/" className="t-label" style={{ textDecoration: "none" }}>
          MenuLift
        </Link>
        <h1 className="t-h2" style={{ marginTop: 16, marginBottom: 8 }}>
          Get the menu off the laminator
        </h1>
        <p className="t-secondary" style={{ margin: 0 }}>
          {TRIAL_DAYS} days free, then {money(PLANS.menu.priceCents)} per location per month. No card
          to start.
        </p>
      </header>
      <AuthForm mode="signup" />
    </main>
  );
}

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthForm } from "@/app/(auth)/AuthForm";
import { getSession } from "@/lib/auth";

export const metadata: Metadata = { title: "Claim your booking page" };

export default async function SignupPage() {
  if (await getSession()) redirect("/today");
  return (
    <>
      <p className="t-label">60 seconds</p>
      <h1 className="t-h2" style={{ margin: "4px 0 8px" }}>
        Claim your booking page
      </h1>
      <p className="t-secondary" style={{ margin: "0 0 24px" }}>
        Your handle is the link that goes in your bio. Everything else — services, policy,
        payouts — comes next, and your page can take bookings before payouts are live.
      </p>
      <AuthForm mode="signup" />
    </>
  );
}

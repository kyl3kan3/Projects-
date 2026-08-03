import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthForm } from "../AuthForm";
import { getSession } from "@/lib/auth";

export const metadata: Metadata = { title: "Start a trial" };

export default async function SignupPage() {
  if (await getSession()) redirect("/talks");

  return (
    <main className="mx-auto w-full max-w-[420px] px-5 pb-20 pt-14">
      <Link href="/" className="t-label" style={{ color: "var(--color-hardhat)" }}>
        SafetyDeck
      </Link>
      <h1 className="t-h2 mt-6">Have the paperwork before the inspector asks.</h1>
      <p className="t-body mt-4" style={{ color: "var(--color-fg-2)" }}>
        Toolbox talks your foreman runs from a phone, signatures captured at the huddle,
        and an incident log that comes out the other end as a correct 300A.
      </p>
      <AuthForm mode="signup" />
    </main>
  );
}

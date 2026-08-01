import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthForm } from "../AuthForm";
import { getSession } from "@/lib/auth";

export const metadata: Metadata = { title: "Start a trial" };

export default async function SignupPage() {
  if (await getSession()) redirect("/pipeline");

  return (
    <main className="mx-auto w-full max-w-[420px] px-5 pb-20 pt-14">
      <Link href="/" className="t-label no-underline">
        GrantGrid
      </Link>
      <h1 className="t-display mt-6">Run grants like a development office.</h1>
      <p className="t-body mt-4" style={{ color: "var(--color-ink-2)" }}>
        Your pipeline, every deadline, and the answers you keep retyping — in one
        place, for a two-person shop.
      </p>
      <AuthForm mode="signup" />
    </main>
  );
}

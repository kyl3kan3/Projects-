import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthForm } from "../AuthForm";
import { signupAction } from "../actions";
import { getSession } from "@/lib/auth";

export const metadata: Metadata = { title: "Start your file" };

export default async function SignupPage() {
  if (await getSession()) redirect("/units");

  return (
    <main className="screen mx-auto flex min-h-dvh max-w-[420px] flex-col justify-center" style={{ paddingBottom: 32 }}>
      <Link href="/" className="t-label mb-8 no-underline">
        TenantFile
      </Link>
      <h1 className="t-h2 mb-2">Get three units out of the text thread.</h1>
      <p className="t-secondary mb-8">
        30 days free, no card. Put one unit in and the listing link, the application form, the ledger and the file
        already exist.
      </p>
      <AuthForm mode="signup" action={signupAction} />
    </main>
  );
}

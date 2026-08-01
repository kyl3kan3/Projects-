import type { Metadata } from "next";
import Link from "next/link";
import { AuthForm } from "../AuthForm";
import { signupAction } from "../actions";

export const metadata: Metadata = { title: "Set up your association" };

export default function SignupPage() {
  return (
    <main className="screen-plain pt-12" style={{ maxWidth: 440 }}>
      <Link href="/" className="t-label">
        DuesDesk
      </Link>
      <h1 className="t-h2 mt-6">Set the association up once. The next treasurer inherits it.</h1>
      <p className="t-secondary mt-2 mb-8">
        You become the president on this account and can add the rest of the board afterwards.
        Board seats are unlimited and free.
      </p>
      <AuthForm mode="signup" action={signupAction} />
    </main>
  );
}

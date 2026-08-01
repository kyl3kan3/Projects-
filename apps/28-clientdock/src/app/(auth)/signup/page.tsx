import type { Metadata } from "next";
import Link from "next/link";
import { AuthForm } from "../AuthForm";
import { signupAction } from "../actions";

export const metadata: Metadata = {
  title: "Open your first portal",
  description: "Start a 14-day trial. Two portals, your logo and colours, no card.",
};

export default function SignupPage() {
  return (
    <main className="screen" style={{ maxWidth: 440 }}>
      <header className="pt-10 pb-8">
        <Link href="/" className="t-label" style={{ color: "var(--wl-accent)" }}>
          ClientDock
        </Link>
        <h1 className="t-display mt-4">Give your clients a lobby.</h1>
        <p className="t-secondary mt-3">
          Two portals free for 14 days, your logo and colours on both. No card, and nothing to
          uninstall if you walk away.
        </p>
      </header>
      <AuthForm mode="signup" action={signupAction} />
      <p className="t-secondary mt-8">
        Your clients never make an account. They get a link, and it opens.
      </p>
    </main>
  );
}

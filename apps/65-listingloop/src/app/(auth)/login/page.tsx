import type { Metadata } from "next";
import { LoginForm } from "../AuthForm";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <>
      <h1 className="t-display">Sign in.</h1>
      <p className="t-body mt-3 text-dim">Your files are where you left them.</p>
      <div className="mt-8">
        <LoginForm />
      </div>
    </>
  );
}

import type { Metadata } from "next";
import { AuthForm } from "../AuthForm";
import { loginAction } from "../actions";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <>
      <h1 className="t-h2 mb-2">Sign in</h1>
      <p className="t-secondary mb-8">Your reviews and playbook are where you left them.</p>
      <AuthForm mode="login" action={loginAction} />
    </>
  );
}

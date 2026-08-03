import type { Metadata } from "next";
import Link from "next/link";
import { IconBeltBar } from "@/components/icons";
import { LoginForm } from "../AuthForms";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <main className="screen-narrow">
      <header style={{ paddingTop: 32, paddingBottom: 24 }}>
        <Link href="/" className="flex items-center gap-2 fg">
          <span className="crimson">
            <IconBeltBar size={22} />
          </span>
          <span className="t-title">MatPass</span>
        </Link>
        <h1 className="t-h2" style={{ marginTop: 24 }}>
          Sign in
        </h1>
        <p className="t-secondary" style={{ marginTop: 8 }}>
          Staff only. The door tablet never asks for this — it runs on its own device token.
        </p>
      </header>
      <LoginForm />
    </main>
  );
}

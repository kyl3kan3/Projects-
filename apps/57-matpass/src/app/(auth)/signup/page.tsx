import type { Metadata } from "next";
import Link from "next/link";
import { IconBeltBar } from "@/components/icons";
import { SignupForm } from "../AuthForms";

export const metadata: Metadata = { title: "Start free — 14 days" };

export default function SignupPage() {
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
          Set up your school
        </h1>
        <p className="t-secondary" style={{ marginTop: 8 }}>
          Pick a curriculum template, import your roster, and check in your first class — one
          evening, unassisted.
        </p>
      </header>
      <SignupForm />
    </main>
  );
}

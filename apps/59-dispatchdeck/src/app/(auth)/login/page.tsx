import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { LoginForm } from "../AuthForm";
import { currentContext } from "@/lib/auth";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage() {
  const ctx = await currentContext();
  if (ctx) redirect(ctx.user.role === "driver" ? "/cab" : "/loads");

  return (
    <main className="screen" style={{ maxWidth: 420 }}>
      <Link href="/" className="t-placard" style={{ textDecoration: "none" }}>
        DispatchDeck
      </Link>
      <h1 className="t-h2 mt-6 mb-2">Sign in</h1>
      <p className="t-secondary mb-8">
        The load board, the cab card and the packet builder are all behind this one door.
      </p>
      <LoginForm />
    </main>
  );
}

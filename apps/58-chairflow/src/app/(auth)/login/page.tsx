import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthForm } from "@/app/(auth)/AuthForm";
import { getSession } from "@/lib/auth";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage() {
  if (await getSession()) redirect("/today");
  return (
    <>
      <p className="t-label">Welcome back</p>
      <h1 className="t-h2" style={{ margin: "4px 0 24px" }}>
        Sign in
      </h1>
      <AuthForm mode="login" />
    </>
  );
}

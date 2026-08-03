import type { Metadata } from "next";
import { AuthForm } from "../AuthForm";

export const metadata: Metadata = { title: "Start free — 14 days" };

export default function SignupPage() {
  return <AuthForm mode="signup" />;
}

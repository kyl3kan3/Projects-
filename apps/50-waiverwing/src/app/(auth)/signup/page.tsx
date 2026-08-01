import type { Metadata } from "next";
import { AuthForm } from "../AuthForm";

export const metadata: Metadata = { title: "Start a trial" };

export default function SignupPage() {
  return <AuthForm mode="signup" />;
}

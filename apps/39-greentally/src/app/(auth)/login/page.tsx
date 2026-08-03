import type { Metadata } from "next";
import { AuthForm } from "../AuthForm";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to GreenTally.",
};

export default function LoginPage() {
  return <AuthForm mode="login" />;
}

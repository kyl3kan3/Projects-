import type { Metadata } from "next";
import { AuthForm } from "../AuthForm";
import { signupAction } from "../actions";

export const metadata: Metadata = { title: "Start your trial" };

export default function SignupPage() {
  return <AuthForm mode="signup" action={signupAction} />;
}

import type { Metadata } from "next";
import { AuthForm } from "../AuthForm";

export const metadata: Metadata = {
  title: "Start the footprint preview",
  description:
    "Create a GreenTally account, upload one electricity bill, and see a real Scope 2 number with the factor it came from.",
};

export default function SignupPage() {
  return <AuthForm mode="signup" />;
}

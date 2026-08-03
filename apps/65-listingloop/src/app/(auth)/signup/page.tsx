import type { Metadata } from "next";
import { SignupForm } from "../AuthForm";

export const metadata: Metadata = { title: "Open your desk" };

export default function SignupPage() {
  return (
    <>
      <h1 className="t-display">Open your desk.</h1>
      <p className="t-body mt-3 text-dim">
        Fourteen days, every feature, no card. Your first file&rsquo;s timeline computes itself
        the moment you enter the contract date.
      </p>
      <div className="mt-8">
        <SignupForm />
      </div>
    </>
  );
}

import Link from "next/link";
import { AuthForm } from "@/components/AuthForm";
import { BrandMark } from "@/components/icons";

export default function SignupPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-5 py-12">
      <div className="mb-8 flex items-center gap-2">
        <BrandMark size={28} />
        <span className="t-title text-lg">Briefcast</span>
      </div>
      <h1 className="t-h2">Start free trial</h1>
      <p className="t-secondary mt-2">14 days, no card. A sample brief is waiting inside so you can see the whole flow.</p>
      <div className="mt-6"><AuthForm mode="signup" /></div>
      <p className="t-secondary mt-6">
        Already have an account? <Link href="/login" className="text-[var(--color-blue)]">Log in</Link>
      </p>
    </main>
  );
}

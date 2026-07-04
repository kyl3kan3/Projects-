import Link from "next/link";
import { AuthForm } from "@/components/AuthForm";
import { BrandMark } from "@/components/icons";

export default function LoginPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-5 py-12">
      <div className="mb-8 flex items-center gap-2">
        <BrandMark size={28} />
        <span className="t-title text-lg">Dunly</span>
      </div>
      <h1 className="t-h2">Log in</h1>
      <div className="mt-6">
        <AuthForm mode="login" />
      </div>
      <p className="t-secondary mt-6">
        New here?{" "}
        <Link href="/signup" className="text-[var(--color-banknote)]">
          Start recovering
        </Link>
      </p>
    </main>
  );
}

import Link from "next/link";
import { IconFile } from "@/components/icons";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto min-h-dvh max-w-md px-5 pb-20 pt-10">
      <Link href="/" className="inline-flex items-center gap-2 text-ink no-underline">
        <IconFile size={22} />
        <span className="t-title">ListingLoop</span>
      </Link>
      <div className="mt-10">{children}</div>
    </main>
  );
}

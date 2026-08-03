import Link from "next/link";
import { IconCompass } from "@/components/icons";
import { Banner } from "@/components/Banner";

/** The sign-in surfaces: one column, gutter 20, the banner in the footer. */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="screen" style={{ maxWidth: 520, paddingBottom: 40 }}>
      <Link
        href="/"
        className="mt-8 mb-10 flex items-center gap-2 no-underline"
        style={{ color: "var(--color-ink)", minHeight: 44 }}
      >
        <span style={{ color: "var(--color-oxblood)" }}>
          <IconCompass size={22} />
        </span>
        <span className="t-title">ClauseCompass</span>
      </Link>
      {children}
      <div className="mt-14">
        <Banner />
      </div>
    </main>
  );
}

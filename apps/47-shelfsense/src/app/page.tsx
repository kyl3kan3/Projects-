import Link from "next/link";

/**
 * Placeholder landing page. The real one is built last, to MARKETING_PLAYBOOK.md.
 */
export default function LandingPage() {
  return (
    <main className="screen" style={{ paddingBottom: 40 }}>
      <header className="pt-12">
        <span className="t-label" style={{ color: "var(--color-kraft)" }}>
          ShelfSense
        </span>
        <h1 className="t-h2 mt-4">Inventory forecasting for Shopify merchants.</h1>
      </header>
      <div className="mt-8 flex flex-col gap-3">
        <Link href="/signup" className="btn btn-primary btn-full">
          Start the 14-day trial
        </Link>
        <Link href="/login" className="btn btn-secondary btn-full">
          Sign in
        </Link>
      </div>
    </main>
  );
}

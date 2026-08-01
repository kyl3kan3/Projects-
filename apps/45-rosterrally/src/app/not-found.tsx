import Link from "next/link";

export default function NotFound() {
  return (
    <main className="world-night screen-narrow min-h-dvh">
      <div className="pt-16">
        <p className="t-label">RosterRally</p>
        <h1 className="t-h2 mt-3">That page is not here</h1>
        <p className="t-secondary mt-2">
          If you followed a link from a message, ask your club for a fresh one — family links are
          rotated when a club replaces them.
        </p>
        <p className="mt-6 flex gap-4">
          <Link href="/" className="btn btn-secondary">
            The homepage
          </Link>
          <Link href="/season" className="btn-quiet">
            The console
          </Link>
        </p>
      </div>
    </main>
  );
}

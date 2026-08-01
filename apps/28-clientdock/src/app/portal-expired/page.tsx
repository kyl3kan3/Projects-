import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "That link has been used",
  robots: { index: false, follow: false },
};

/**
 * Where a spent magic link lands. There is no portal slug to send them to — the
 * token was the only thing that named the portal — so this page has to be useful
 * without knowing which agency the visitor belongs to.
 */
export default function PortalExpiredPage() {
  return (
    <main className="screen screen-portal">
      <div className="pt-16">
        <h1 className="t-display">That link has already been used.</h1>
        <p className="t-body mt-4">
          Portal links work once. That is what keeps your files, approvals and invoices private —
          a forwarded email can&apos;t open your portal.
        </p>
        <p className="t-secondary mt-4">
          Ask whoever set the portal up for a fresh link, or open the portal address you were given
          and request one there. It takes a moment and needs no password.
        </p>
      </div>
    </main>
  );
}

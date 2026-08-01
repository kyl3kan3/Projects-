import Link from "next/link";

/**
 * The 404. Deliberately not a dead end: the two things somebody landing here
 * actually wants are the board sign-in and a fresh payment link.
 */
export default function NotFound() {
  return (
    <main className="screen-plain pt-16" style={{ maxWidth: 480 }}>
      <p className="t-label">DuesDesk</p>
      <h1 className="t-h2 mt-4">There is nothing at that address.</h1>
      <p className="t-body mt-3">
        If you were following a payment link from your association, it may have been broken across
        two lines by your email program. Open the most recent email again, or ask your board to send
        a fresh link.
      </p>
      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <Link href="/login" className="btn btn-primary">
          Sign in to the board dashboard
        </Link>
        <Link href="/" className="btn btn-secondary">
          About DuesDesk
        </Link>
      </div>
    </main>
  );
}

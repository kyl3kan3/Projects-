import Link from "next/link";

export default function LandingPage() {
  return (
    <main className="screen-plain">
      <h1 className="t-display">The no-show that paid for itself.</h1>
      <Link className="btn btn-primary" href="/signup">
        Claim your booking page
      </Link>
    </main>
  );
}

import Link from "next/link";
import { Brand } from "@/components/brand";
import { Icon } from "@/components/icons";
import { formatMoney } from "@/lib/format";
import { dashboardStats } from "@/lib/sample-data";

export default function ConnectPage() {
  return (
    <main className="screen grid place-items-center">
      <section className="w-full max-w-md">
        <Brand href="/" />
        <div className="panel mt-8 p-5">
          <p className="t-label">90-day recovery preview</p>
          <h1 className="t-h2 mt-3">Connect Stripe. See the leak before sending a single email.</h1>
          <p className="t-secondary mt-3">
            Dunly imports the last 90 days of failed invoices, separates baseline Stripe recoveries, and estimates the
            revenue a conservative campaign would have recovered.
          </p>
          <div className="mt-6 rounded-[8px] border border-[var(--color-hairline)] p-4">
            <p className="t-label">Likely recovered last quarter</p>
            <p className="money mt-3 text-4xl text-[var(--color-banknote)]">{formatMoney(dashboardStats.recoveryPreviewCents)}</p>
            <p className="t-secondary mt-2">From 31 failed invoices and 14 active subscriptions.</p>
          </div>
          <Link href="/api/connect/stripe" className="btn btn-primary mt-6 w-full">
            <Icon name="card" className="h-[18px] w-[18px]" />
            Connect Stripe
          </Link>
          <Link href="/dashboard" className="btn btn-secondary mt-3 w-full">
            Open demo dashboard
          </Link>
        </div>
      </section>
    </main>
  );
}

import { Icon } from "@/components/icons";
import { CardUpdateForm } from "@/components/card-update-form";
import { cardUpdateDemo } from "@/lib/sample-data";

export default async function CardUpdatePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const isDemo = token === cardUpdateDemo.token || token.length > 0;

  return (
    <main className="screen grid place-items-center">
      <section className="w-full max-w-md">
        <div className="panel p-5">
          <div className="mb-6 flex items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-[8px] border border-[var(--color-hairline)] text-[var(--color-banknote)]">
              <Icon name="card" className="h-5 w-5" />
            </span>
            <div>
              <p className="t-label">Secure card update</p>
              <p className="t-secondary">Signed link - no account needed</p>
            </div>
          </div>
          <h1 className="t-h2">Update the card for {isDemo ? cardUpdateDemo.customer : "your subscription"}</h1>
          <p className="t-secondary mt-3">
            This page creates a Stripe SetupIntent in live mode. In local dry-run it shows the exact handoff without
            transmitting payment details.
          </p>
          <CardUpdateForm token={token} amountCents={cardUpdateDemo.amountCents} />
        </div>
      </section>
    </main>
  );
}

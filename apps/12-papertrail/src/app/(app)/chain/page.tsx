import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { chainAction, chainMoney, listChains, recentlyChangedId } from "@/lib/chain";
import { refreshOverdue } from "@/lib/invoices";
import { formatMoneyShort } from "@/lib/money";
import { ChainThread } from "@/components/Chain";
import { IconPlus } from "@/components/icons";

export const metadata: Metadata = { title: "Chain" };

/**
 * The money screen. One thread per engagement: proposal → contract → deposit →
 * final, with what has been collected against what was signed.
 */
export default async function ChainPage() {
  const user = await requireUser();
  const now = new Date();
  await refreshOverdue(user.id, now);
  const chains = await listChains(user.id);

  if (!chains.length) {
    return (
      <main className="screen pt-6">
        <h1 className="t-h2">One thread from maybe to paid.</h1>
        <p className="t-secondary mt-2 max-w-[44ch]">
          Every engagement starts as a proposal. Accepting it drafts the contract from the same words
          and prices; signing it raises the deposit invoice and emails it. You will see the whole
          thread here, and where it has stopped.
        </p>

        <section className="mt-8">
          <h2 className="t-label">What that looks like</h2>
          <ol className="mt-3 list-none p-0">
            {[
              ["Proposal", "You write the scope and price, with optional add-ons the client can tick."],
              ["Contract", "Drafted for you from exactly what they accepted. They sign on their phone."],
              ["Deposit invoice", "Raised and emailed the moment they sign. You don't have to be awake."],
              ["Final invoice", "Raised when you mark the work complete, then chased for you if it goes late."],
            ].map(([title, body], i) => (
              <li key={title} className="row items-start">
                <span className="t-money" style={{ width: 20 }}>
                  {i + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="t-title block">{title}</span>
                  <span className="t-secondary block">{body}</span>
                </span>
              </li>
            ))}
          </ol>
        </section>

        <Link href="/documents/new" className="thumb-cta btn btn-primary btn-full">
          <IconPlus size={18} />
          Write your first proposal
        </Link>
      </main>
    );
  }

  const first = chains[0];
  const action = chainAction(first.nodes);

  return (
    <main className="screen pt-6">
      <h1 className="t-h2">Chain</h1>
      <p className="t-secondary mt-1">
        {chains.length} {chains.length === 1 ? "engagement" : "engagements"}
      </p>

      <div className="mt-8 flex flex-col gap-10">
        {chains.map((chain) => {
          const money = chainMoney(chain.nodes);
          return (
            <section key={chain.root.id}>
              <header className="hairline-b pb-3">
                <h2 className="t-h2">
                  {chain.client.company || chain.client.name} ·{" "}
                  {formatMoneyShort(money.engagement, chain.root.currency)} engagement
                </h2>
                <p className="t-secondary mt-1">
                  {formatMoneyShort(money.collected, chain.root.currency)} collected
                  {money.outstanding > 0
                    ? ` · ${formatMoneyShort(money.outstanding, chain.root.currency)} outstanding`
                    : " · nothing outstanding"}
                </p>
              </header>
              <div className="mt-4">
                <ChainThread
                  nodes={chain.nodes}
                  now={now}
                  justChangedId={recentlyChangedId(chain.nodes, now)}
                />
              </div>
            </section>
          );
        })}
      </div>

      {action ? (
        <Link href={`/documents/${action.documentId}`} className="thumb-cta btn btn-primary btn-full">
          {action.label}
        </Link>
      ) : (
        <Link href="/documents/new" className="thumb-cta btn btn-primary btn-full">
          <IconPlus size={18} />
          New proposal
        </Link>
      )}
    </main>
  );
}

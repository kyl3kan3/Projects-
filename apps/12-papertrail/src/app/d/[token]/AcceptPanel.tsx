"use client";

/**
 * Acceptance, on the client's phone: tick the add-ons, watch the total move,
 * accept. The total is the one number they care about, so it is recomputed here
 * with the same functions the server uses — and then recomputed again on the
 * server, which is what actually counts.
 */

import { useActionState, useMemo, useState } from "react";
import { computeTotals, formatMoney, lineTotal } from "@/lib/money";
import { IconCheck } from "@/components/icons";
import type { LineItem } from "@/db/schema";
import type { PublicState } from "./actions";

export function AcceptPanel({
  token,
  caption,
  lines,
  currency,
  taxRateBps,
  taxLabel,
  action,
}: {
  token: string;
  caption: string;
  lines: LineItem[];
  currency: string;
  taxRateBps: number;
  taxLabel: string;
  action: (prev: PublicState, formData: FormData) => Promise<PublicState>;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const [chosen, setChosen] = useState<string[]>(
    lines.filter((l) => l.optional && l.selected).map((l) => l.id),
  );

  const totals = useMemo(
    () =>
      computeTotals(
        lines.map((l) => (l.optional ? { ...l, selected: chosen.includes(l.id) } : l)),
        taxRateBps,
      ),
    [lines, chosen, taxRateBps],
  );

  const required = lines.filter((l) => !l.optional);
  const optional = lines.filter((l) => l.optional);

  if (state.ok) {
    return (
      <section>
        <h2 className="t-h2">Accepted — thank you.</h2>
        <p className="t-doc mt-2">{state.message}</p>
      </section>
    );
  }

  return (
    <form action={formAction} id="accept">
      <input type="hidden" name="token" value={token} />
      <section>
        <h2 className="t-h2">{caption || "Fees"}</h2>
        <table className="mt-3 w-full border-collapse">
          <tbody>
            {required.map((line) => (
              <tr key={line.id} className="hairline-b">
                <td className="t-doc py-3 pr-3 align-top">
                  {line.description}
                  {line.quantity !== 1 ? (
                    <span className="t-meta mt-1 block">
                      {line.quantity} × {formatMoney(line.unitAmount, currency)}
                    </span>
                  ) : null}
                </td>
                <td className="t-doc-money py-3 text-right align-top whitespace-nowrap">
                  {formatMoney(lineTotal(line), currency)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {optional.length ? (
          <div className="mt-6">
            <h3 className="t-label">Optional extras — choose any</h3>
            <ul className="mt-2 list-none p-0">
              {optional.map((line) => {
                const on = chosen.includes(line.id);
                return (
                  <li key={line.id} className="hairline-b flex items-start gap-3 py-3">
                    <button
                      type="button"
                      className="tickbox mt-[2px]"
                      role="checkbox"
                      aria-checked={on}
                      aria-label={line.description}
                      onClick={() =>
                        setChosen((c) => (on ? c.filter((id) => id !== line.id) : [...c, line.id]))
                      }
                    >
                      <IconCheck size={16} />
                    </button>
                    {on ? <input type="hidden" name="addon" value={line.id} /> : null}
                    <span className="t-doc min-w-0 flex-1">{line.description}</span>
                    <span className="t-doc-money whitespace-nowrap">
                      {formatMoney(lineTotal(line), currency)}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}

        <table className="mt-4 w-full border-collapse">
          <tbody>
            {totals.tax > 0 ? (
              <>
                <tr>
                  <td className="t-secondary pt-2">Subtotal</td>
                  <td className="t-doc-money pt-2 text-right whitespace-nowrap">
                    {formatMoney(totals.subtotal, currency)}
                  </td>
                </tr>
                <tr>
                  <td className="t-secondary pt-1">{taxLabel}</td>
                  <td className="t-doc-money pt-1 text-right whitespace-nowrap">
                    {formatMoney(totals.tax, currency)}
                  </td>
                </tr>
              </>
            ) : null}
            <tr>
              <td className="t-label pt-4">Total</td>
              <td
                className="t-doc-money pt-4 text-right whitespace-nowrap"
                style={{ fontSize: 22 }}
              >
                {formatMoney(totals.total, currency)}
              </td>
            </tr>
          </tbody>
        </table>
      </section>

      {state.error ? (
        <p className="t-secondary mt-4" style={{ color: "var(--color-vermilion)" }} role="alert">
          {state.error}
        </p>
      ) : null}

      <button className="btn btn-primary btn-full mt-6" type="submit" disabled={pending}>
        {pending ? "Accepting…" : `Accept — ${formatMoney(totals.total, currency)}`}
      </button>
      <p className="t-secondary mt-3">
        Accepting isn't a signature. You'll get the contract to read and sign next.
      </p>
    </form>
  );
}

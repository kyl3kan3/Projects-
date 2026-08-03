import Link from "next/link";
import { IconChevronRight } from "@/components/icons";
import { formatStamp } from "@/lib/dates";
import { DOT_COLOR, daysLabel, dotToneFor } from "@/lib/display";
import { formatMoney } from "@/lib/money";
import type { LadderStatusLine } from "@/lib/ladder";

export interface InvoiceRowProps {
  href: string;
  clientName: string;
  invoiceNumber: string;
  amountCents: number;
  currency: string;
  daysLate: number;
  stateLine: string;
  ladder: LadderStatusLine;
  settled: boolean;
  paidAt?: string | null;
  /** Render the settle rule: this row was just ruled off. */
  justSettled?: boolean;
  index?: number;
}

/**
 * A full-bleed hairline row — no boxes (DESIGN.md). Title is the client name,
 * mono amount right, a secondary state line, and a 6px status dot on the left.
 *
 * The settled variant carries the signature: a banker rule drawn under the row
 * and a mono `PAID · 14 JUL` stamp.
 */
export function InvoiceRow(props: InvoiceRowProps) {
  const tone = dotToneFor({
    daysLate: props.daysLate,
    hold: props.ladder.hold,
    settled: props.settled,
    stepsSent: props.ladder.stepsSent,
  });

  return (
    <Link
      href={props.href}
      className="row row-enter"
      style={{
        position: "relative",
        animationDelay: `${Math.min(props.index ?? 0, 8) * 24}ms`,
      }}
    >
      <span className="dot" style={{ background: DOT_COLOR[tone] }} aria-hidden="true" />
      <span style={{ flex: 1, minWidth: 0 }}>
        <span className="t-title" style={{ display: "block" }}>
          {props.clientName}
        </span>
        <span
          className="t-secondary"
          style={{
            display: "block",
            marginTop: 2,
            color: "var(--color-text-3)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {/*
            DESIGN.md's secondary line is the sequence state ("step 2 of 4 ·
            next nudge Tue"), not a second copy of the day count that already
            sits in the mono column on the right. Carrying both overflowed the
            row at 390px and truncated the half that matters.
          */}
          {props.invoiceNumber} · {props.settled ? props.stateLine : props.ladder.label}
        </span>
      </span>
      <span style={{ textAlign: "right", flex: "none" }}>
        <span
          className="t-data"
          style={{ display: "block", fontSize: 14, color: props.settled ? "var(--color-banker)" : undefined }}
        >
          {formatMoney(props.amountCents, props.currency)}
        </span>
        {props.settled ? (
          <span
            className={`t-data ${props.justSettled ? "settle-stamp" : ""}`}
            style={{ display: "block", marginTop: 2, color: "var(--color-banker)", opacity: 0.9 }}
          >
            PAID{props.paidAt ? ` · ${formatStamp(props.paidAt)}` : ""}
          </span>
        ) : (
          <span className="t-data" style={{ display: "block", marginTop: 2, color: "var(--color-text-3)" }}>
            {props.daysLate > 0 ? daysLabel(props.daysLate) : "—"}
          </span>
        )}
      </span>
      <IconChevronRight size={18} style={{ color: "var(--color-text-3)", flex: "none" }} />
      {props.justSettled ? <span className="settle-rule" /> : null}
    </Link>
  );
}

/**
 * src/server/report.ts
 *
 * The monthly owner report, as a PDF.
 *
 * It exists to be read by a dentist and repeated to their accountant, so it is
 * built in that order: the recovered figure, then the receipts behind it, then the
 * holdout comparison that answers "they would have come back anyway" — including
 * when the answer is unflattering. There is no second, friendlier number, and no
 * chart that implies one.
 *
 * The PDF is generated on demand and streamed to the browser under the practice's
 * own session. It is never emailed, because a monthly attribution report is a
 * list of patient names and PHI does not belong in an outbound attachment.
 */

import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { formatDay, formatMonthYear } from "@/lib/dates";
import { money } from "@/lib/format";
import { planName, type Plan } from "@/lib/plans";
import { holdoutComparison, ledgerRows, recoveredSummary } from "@/server/ledger";

/** DESIGN.md's ink and aqua, so the report and the product are one object. */
const INK = rgb(0.125, 0.157, 0.173);
const INK2 = rgb(0.392, 0.439, 0.463);
const AQUA = rgb(0.247, 0.561, 0.627);
const LINE = rgb(0.878, 0.898, 0.906);

export async function ownerReportPdf(input: {
  practiceName: string;
  locationName: string;
  plan: Plan;
  locationId: string;
  monthlyCents: number;
  now?: Date;
}): Promise<Uint8Array> {
  const now = input.now ?? new Date();
  const summary = await recoveredSummary({ locationId: input.locationId, now });
  const rows = await ledgerRows({ locationId: input.locationId, limit: 14 });
  const holdout = await holdoutComparison({ locationId: input.locationId, days: 90, now });

  const doc = await PDFDocument.create();
  const page = doc.addPage([595.28, 841.89]); // A4
  const sans = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const mono = await doc.embedFont(StandardFonts.Courier);

  const left = 48;
  const right = 595.28 - 48;
  let y = 780;

  const text = (
    value: string,
    opts: { size?: number; font?: typeof sans; color?: typeof INK; x?: number } = {},
  ) => {
    page.drawText(value, {
      x: opts.x ?? left,
      y,
      size: opts.size ?? 10,
      font: opts.font ?? sans,
      color: opts.color ?? INK,
    });
  };

  const rule = () => {
    page.drawLine({ start: { x: left, y }, end: { x: right, y }, thickness: 0.75, color: LINE });
  };

  text("RECALLDESK — OWNER REPORT", { size: 9, font: bold, color: INK2 });
  y -= 26;
  text(input.practiceName, { size: 20, font: bold });
  y -= 16;
  text(`${input.locationName} · ${formatMonthYear(now)} · ${planName(input.plan)}`, {
    size: 10,
    color: INK2,
  });
  y -= 18;
  rule();
  y -= 30;

  text("RECOVERED PRODUCTION THIS MONTH", { size: 9, font: bold, color: INK2 });
  y -= 30;
  page.drawText(money(summary.monthCents), { x: left, y, size: 34, font: mono, color: INK });
  y -= 18;
  text(
    `${summary.monthBookings} ${summary.monthBookings === 1 ? "booking" : "bookings"} attributed this month · ${money(summary.quarterCents)} this quarter`,
    { size: 10, color: INK2 },
  );
  y -= 14;
  text(
    `${summary.touchesSentThisMonth} touches sent · subscription ${money(input.monthlyCents)}/mo`,
    { size: 10, color: INK2 },
  );
  y -= 22;

  const multiple = input.monthlyCents > 0 ? summary.monthCents / input.monthlyCents : 0;
  text(
    multiple > 0
      ? `That is ${multiple.toFixed(1)}x the subscription, counted conservatively.`
      : "No bookings met the attribution window this month.",
    { size: 10, font: bold, color: multiple >= 1 ? AQUA : INK2 },
  );
  y -= 20;
  rule();
  y -= 26;

  text("HOW THIS IS COUNTED", { size: 9, font: bold, color: INK2 });
  y -= 16;
  for (const line of [
    "A booking counts only when the patient received a touch — email, text or a front-desk call —",
    "within the attribution window before they booked. No qualifying touch, no credit, no exceptions.",
    `Recovered production is the practice's own estimated visit value at the time of attribution.`,
    `${summary.unattributedBookings} ${summary.unattributedBookings === 1 ? "booking is" : "bookings are"} recorded with no qualifying touch and contribute nothing to the figure above.`,
  ]) {
    text(line, { size: 9.5, color: INK2 });
    y -= 13;
  }
  y -= 12;
  rule();
  y -= 26;

  text("WOULD THEY HAVE COME BACK ANYWAY?", { size: 9, font: bold, color: INK2 });
  y -= 16;
  if (holdout.touchedPatients === 0 && holdout.untouchedPatients === 0) {
    text("Not enough overdue history yet to compare touched and untouched patients.", {
      size: 9.5,
      color: INK2,
    });
    y -= 13;
  } else {
    text(
      `Over the last ${holdout.days} days, ${holdout.touchedReturned} of ${holdout.touchedPatients} contacted overdue patients came back (${(holdout.touchedRate * 100).toFixed(1)}%).`,
      { size: 9.5, color: INK2 },
    );
    y -= 13;
    text(
      `Of the ${holdout.untouchedPatients} overdue patients nobody contacted, ${holdout.untouchedReturned} came back on their own (${(holdout.untouchedRate * 100).toFixed(1)}%).`,
      { size: 9.5, color: INK2 },
    );
    y -= 13;
    text(
      holdout.liftPoints >= 0
        ? `Difference: ${holdout.liftPoints.toFixed(1)} percentage points.`
        : `Difference: ${holdout.liftPoints.toFixed(1)} percentage points — the untouched group did better this period.`,
      { size: 9.5, font: bold, color: INK },
    );
    y -= 13;
  }
  y -= 12;
  rule();
  y -= 26;

  text("THE LEDGER — EVERY ROW A RECEIPT", { size: 9, font: bold, color: INK2 });
  y -= 18;
  text("BOOKED", { size: 8, font: bold, color: INK2, x: left });
  text("PATIENT", { size: 8, font: bold, color: INK2, x: left + 78 });
  text("CREDITED TOUCH", { size: 8, font: bold, color: INK2, x: left + 250 });
  text("AMOUNT", { size: 8, font: bold, color: INK2, x: right - 60 });
  y -= 6;
  rule();
  y -= 14;

  for (const row of rows) {
    if (y < 70) break;
    page.drawText(formatDay(row.bookedAt), { x: left, y, size: 8.5, font: mono, color: INK2 });
    page.drawText(row.patientName.slice(0, 28), { x: left + 78, y, size: 9.5, font: sans, color: INK });
    if (row.attribution) {
      const channel =
        row.attribution.touchChannel === "sms"
          ? "Text"
          : row.attribution.touchChannel === "email"
            ? "Email"
            : "Call";
      page.drawText(
        `${channel} ${formatDay(row.attribution.touchOccurredAt)} · ${row.attribution.daysBefore}d before`,
        { x: left + 250, y, size: 8.5, font: sans, color: INK2 },
      );
      page.drawText(money(row.attribution.productionCents), {
        x: right - 60,
        y,
        size: 9,
        font: mono,
        color: INK,
      });
    } else {
      page.drawText("no qualifying touch", { x: left + 250, y, size: 8.5, font: sans, color: INK2 });
      page.drawText("—", { x: right - 60, y, size: 9, font: mono, color: INK2 });
    }
    y -= 15;
  }

  y = 48;
  text(
    `Generated ${formatDay(now)} by RecallDesk. Every figure above is derived from this location's own imports, touches and bookings.`,
    { size: 8, color: INK2 },
  );

  return doc.save();
}

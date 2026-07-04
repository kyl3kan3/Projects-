import { NextResponse } from "next/server";
import { formatMoney } from "@/lib/format";
import { roiStatement } from "@/lib/sample-data";

export function GET() {
  const lines = [
    "Dunly ROI Statement",
    `Period,${roiStatement.period}`,
    `Recovered by Dunly,${formatMoney(roiStatement.recoveredCents)}`,
    `Baseline recoveries excluded,${formatMoney(roiStatement.baselineCents)}`,
    `Still at risk,${formatMoney(roiStatement.atRiskCents)}`,
    `Dunly fee,${formatMoney(roiStatement.subscriptionCents)}`,
    `Multiple,${roiStatement.multiple}x`,
  ];

  return new NextResponse(lines.join("\n"), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": 'attachment; filename="dunly-roi-statement.csv"',
    },
  });
}

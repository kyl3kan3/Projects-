import { formatMoney } from "@/lib/format";
import { roiStatement } from "@/lib/sample-data";
import { Icon } from "./icons";

export function RoiStatement() {
  return (
    <section className="paper-page rounded-[8px] p-5 text-[#181D20]">
      <div className="flex items-start justify-between gap-4 border-b border-[#E3E8E5] pb-5">
        <div>
          <p className="text-[11px] font-semibold uppercase text-[#64736C]">ROI statement</p>
          <h1 className="mt-2 text-[22px] font-semibold leading-tight">{roiStatement.period}</h1>
        </div>
        <span className="data text-xs text-[#64736C]">DUNLY</span>
      </div>
      <div className="py-8">
        <p className="text-[11px] font-semibold uppercase text-[#64736C]">Recovered by Dunly</p>
        <p className="money mt-3 text-[40px] font-semibold leading-none">
          <span className="text-[var(--color-banknote)]">$</span>
          {Math.floor(roiStatement.recoveredCents / 100).toLocaleString("en-US")}
        </p>
      </div>
      <div className="border-y border-[#E3E8E5]">
        {roiStatement.rows.map(([label, cents]) => (
          <div key={label} className="flex items-center justify-between gap-4 border-b border-[#E3E8E5] py-3 last:border-b-0">
            <span className="text-sm text-[#49554F]">{label}</span>
            <span className="money text-sm">{formatMoney(cents)}</span>
          </div>
        ))}
      </div>
      <p className="mt-6 text-sm leading-relaxed text-[#343D38]">
        Dunly recovered <span className="money font-semibold">{formatMoney(roiStatement.recoveredCents)}</span> -{" "}
        {roiStatement.multiple}x your subscription. Baseline recoveries are shown for trust, but excluded from billed
        performance revenue.
      </p>
      <a href="/api/statement/export" className="btn mt-6 w-full bg-[#181D20] text-[#F2F5F4]">
        <Icon name="download" className="h-[18px] w-[18px]" />
        Export PDF-ready statement
      </a>
    </section>
  );
}

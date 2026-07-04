"use client";

import { useRouter, useSearchParams } from "next/navigation";

const PERIODS = [
  { days: 7, label: "7d" },
  { days: 30, label: "30d" },
  { days: 90, label: "90d" },
];

export function PeriodChips({ current }: { current: number }) {
  const router = useRouter();
  const params = useSearchParams();
  return (
    <div className="flex gap-2">
      {PERIODS.map((p) => (
        <button
          key={p.days}
          className="chip"
          data-active={current === p.days}
          onClick={() => {
            const next = new URLSearchParams(params);
            next.set("period", String(p.days));
            router.replace(`?${next}`);
          }}
        >
          {p.label}
        </button>
      ))}
    </div>
  );
}

"use client";

export function PrintButton() {
  return (
    <button className="btn btn-ink btn-block no-print mt-8" onClick={() => window.print()}>
      Print / save as PDF
    </button>
  );
}

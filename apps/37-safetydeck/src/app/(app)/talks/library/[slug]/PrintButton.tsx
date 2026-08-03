"use client";

import { IconPrinter } from "@/components/icons";

/** The paper escape hatch. A crew with a dead phone still runs the talk. */
export function PrintButton() {
  return (
    <button type="button" className="btn-quiet" onClick={() => window.print()}>
      <IconPrinter size={16} />
      Print
    </button>
  );
}

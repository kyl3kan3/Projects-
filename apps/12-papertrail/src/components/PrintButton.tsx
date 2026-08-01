"use client";

/**
 * "Print or save as PDF" — the client's download path.
 *
 * ARCHITECTURE.md calls for a Puppeteer worker rendering the same view to a
 * stored PDF; that needs a long-lived process, which the Vercel target does not
 * have (see DEPLOYING.md). The print stylesheet in globals.css takes the same
 * markup to paper, so the printed copy cannot drift from the web copy — and the
 * audit trail prints with it.
 */
export function PrintButton() {
  return (
    <button type="button" className="btn-quiet no-print mt-2" onClick={() => window.print()}>
      Print or save as PDF
    </button>
  );
}

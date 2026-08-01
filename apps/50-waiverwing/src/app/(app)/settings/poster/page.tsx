import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { renderQrSvg, signUrl } from "@/lib/qr";
import { liveVersion, listWaivers } from "@/lib/waivers";

export const metadata: Metadata = { title: "QR poster" };
export const dynamic = "force-dynamic";

/**
 * The printable poster. Real A4-ish proportions on paper, laid out so the QR is
 * the biggest thing in the room and the instruction is one sentence.
 *
 * "Waivers by WaiverWing" is the marketing channel (README go-to-market 3) and is
 * suppressed only on the Operator plan.
 */
export default async function PosterPage() {
  const { account, location } = await requireUser();
  const url = signUrl(location.qrToken);
  const svg = await renderQrSvg(url);

  const waivers = await listWaivers(account.id);
  const live = waivers.find((w) => w.status === "live");
  const version = live ? await liveVersion(live.id) : null;

  return (
    <div className="px-5 lg:px-0">
      <div className="no-print pt-6">
        <Link href="/settings" className="btn-quiet">
          Settings
        </Link>
        <h1 className="t-h2 mt-4">QR poster</h1>
        <p className="t-secondary mt-2">
          Print this, put it where the queue forms. Customers sign on their own phone before they
          reach the counter.
        </p>
        {!version ? (
          <p className="t-secondary mt-3" style={{ color: "var(--color-ember)" }}>
            No waiver is published yet, so this code will show a “nothing to sign” page. Publish
            a waiver first.
          </p>
        ) : (
          <p className="t-data mt-3" style={{ color: "var(--color-text-2)" }}>
            RESOLVES TO {live?.title.toUpperCase()} V{version.version}
          </p>
        )}
        <p className="t-secondary mt-3 break-all">{url}</p>
      </div>

      {/* The artifact. Paper ground, ink text: it is going on a wall, not a screen. */}
      <div
        className="mx-auto mt-6 w-full max-w-[520px] px-8 py-12 text-center"
        style={{ background: "#F4F4F0", color: "#14171A", borderRadius: "20px" }}
      >
        <p
          style={{
            fontSize: "11px",
            fontWeight: 600,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "#616A66",
          }}
        >
          {location.name}
        </p>
        <p
          style={{
            marginTop: "12px",
            fontSize: "34px",
            lineHeight: 1.08,
            fontWeight: 600,
            letterSpacing: "-0.01em",
          }}
        >
          Scan to sign your waiver
        </p>
        <p style={{ marginTop: "12px", fontSize: "16px", lineHeight: 1.5, color: "#3A4247" }}>
          About a minute on your phone. One adult can sign for their own children in the same go.
        </p>

        <div
          className="mx-auto mt-8"
          style={{ width: "260px", height: "260px" }}
          // qrcode renders a self-contained SVG; there is no user input in it.
          dangerouslySetInnerHTML={{ __html: svg }}
        />

        <p
          style={{
            marginTop: "20px",
            fontFamily: "var(--font-mono)",
            fontSize: "12px",
            color: "#616A66",
            wordBreak: "break-all",
          }}
        >
          {url}
        </p>

        {account.settings.posterFooter ? (
          <p style={{ marginTop: "28px", fontSize: "12px", color: "#8A938E" }}>
            Waivers by WaiverWing
          </p>
        ) : null}
      </div>

      <div className="no-print mt-6">
        <p className="t-secondary">
          Use your browser&rsquo;s print dialog — the page prints the poster and nothing else.
        </p>
      </div>
    </div>
  );
}

import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { forwardingAddress } from "@/lib/org";
import { CaptureFlow } from "./CaptureFlow";

export const metadata: Metadata = { title: "Photo a receipt" };
export const dynamic = "force-dynamic";

export default async function CapturePage() {
  const { org } = await requireUser();
  return (
    <main className="screen">
      <header className="pt-8">
        <span className="t-label">Capture</span>
        <h1 className="t-h2 mt-2">Photo a receipt</h1>
        <p className="t-secondary mt-2">
          Straight from the counter. It uploads to your inbox and starts extracting on its
          own.
        </p>
      </header>
      <CaptureFlow forwardingAddress={forwardingAddress(org.forwardingSlug)} />
    </main>
  );
}

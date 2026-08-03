import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { ScreenHeader } from "@/components/ScreenHeader";
import { requireOnboardedUser } from "@/lib/auth";
import { getJob } from "@/lib/jobs";
import { transcriptionProvider } from "@/lib/transcription";
import { getWalkthrough, quotaLine, startWalkthrough } from "@/lib/walkthroughs";
import { storageReady } from "@/lib/storage";
import { CaptureClient } from "./CaptureClient";

export const metadata: Metadata = { title: "Walkthrough" };
export const dynamic = "force-dynamic";

export default async function CapturePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ w?: string }>;
}) {
  const { org, user } = await requireOnboardedUser();
  const { id } = await params;
  const { w } = await searchParams;

  const job = await getJob(org.id, id);
  if (!job) notFound();

  let walkthroughId = w ?? null;
  if (walkthroughId) {
    const existing = await getWalkthrough(org.id, walkthroughId);
    if (!existing || existing.job.id !== job.id) walkthroughId = null;
    else if (existing.walkthrough.status === "drafted") redirect(`/jobs/${job.id}`);
  }
  if (!walkthroughId) {
    const created = await startWalkthrough(org, user.id, job.id);
    redirect(`/jobs/${job.id}/capture?w=${created.id}`);
  }

  const storage = storageReady();
  const note =
    transcriptionProvider() === "whisper"
      ? "Narration is transcribed with Whisper, biased toward your trade's vocabulary. Anything you type here is added to it."
      : "No OPENAI_API_KEY is configured, so this walkthrough cannot be transcribed. Your typed notes and photo captions are used as the transcript, alongside a clearly-labelled sample narration, and the estimate says so.";

  return (
    <main>
      <ScreenHeader
        title="Walkthrough"
        backHref={`/jobs/${job.id}`}
        backLabel={job.customerName}
        showSettings={false}
      />
      {!storage.ready ? (
        <p
          className="gutter t-secondary"
          style={{ color: "var(--color-amber)", paddingBottom: 16 }}
        >
          {storage.reason}
        </p>
      ) : null}
      <CaptureClient
        jobId={job.id}
        walkthroughId={walkthroughId}
        address={job.address}
        jobTitle={job.title}
        quotaLine={quotaLine(org)}
        transcriptionNote={note}
      />
    </main>
  );
}

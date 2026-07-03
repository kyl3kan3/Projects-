/**
 * The core pipeline: process_project (transcribe → select → render) plus a
 * fast-lane render_clip re-render. Each stage updates project status so the
 * dashboard can show live progress, and writes a jobs_audit row with cost.
 */

import { eq } from "drizzle-orm";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pipeline as streamPipeline } from "node:stream/promises";
import { createWriteStream } from "node:fs";
import { getDb } from "@/db";
import {
  projects,
  transcripts,
  clipCandidates,
  clips,
  textOutputs,
  jobsAudit,
  brandPresets,
  workspaces,
  users,
  type TranscriptWord,
  type TextOutputContent,
} from "@/db/schema";
import { presignDownload, putObject } from "@/lib/r2";
import {
  extractAudio,
  segmentAudio,
  probeDurationSeconds,
  renderClip,
  renderThumbnail,
} from "@/lib/ffmpeg";
import { transcribeFile, mergeTranscripts, type TranscriptResult } from "@/lib/transcribe";
import { importMedia, type ImportSource } from "@/lib/media-import";
import { selectClips, generateCopy } from "@/lib/ai";
import { planFor } from "@/lib/plans";
import { renderHash } from "@/lib/hash";
import { extForContentType } from "@/lib/utils";
import { sendReadyEmail } from "@/lib/email";
import { readFile } from "node:fs/promises";
import type { PipelineJob } from "@/lib/queue";

const RENDER_TOP_N = 5; // render the best N candidates automatically (×2 aspects)
const WHISPER_MAX_BYTES = 24 * 1024 * 1024; // stay under the 25MB API limit
const SEGMENT_SECONDS = 600; // 10-minute audio chunks when over the limit
const RENDER_ASPECTS = ["9x16", "1x1"] as const; // vertical + square (README MVP)

async function audit(
  projectId: string,
  stage: string,
  fn: () => Promise<number | void>,
): Promise<void> {
  const db = getDb();
  const [row] = await db
    .insert(jobsAudit)
    .values({ projectId, stage, status: "running" })
    .returning();
  try {
    const cost = (await fn()) ?? 0;
    await db
      .update(jobsAudit)
      .set({ status: "done", finishedAt: new Date(), costCents: cost })
      .where(eq(jobsAudit.id, row.id));
  } catch (err) {
    await db
      .update(jobsAudit)
      .set({
        status: "failed",
        finishedAt: new Date(),
        error: err instanceof Error ? err.message : String(err),
      })
      .where(eq(jobsAudit.id, row.id));
    throw err;
  }
}

async function setStatus(projectId: string, status: (typeof projects.status.enumValues)[number]) {
  await getDb().update(projects).set({ status }).where(eq(projects.id, projectId));
}

async function downloadTo(key: string, dest: string): Promise<void> {
  const url = await presignDownload(key);
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`Failed to download ${key}: ${res.status}`);
  await streamPipeline(
    res.body as unknown as NodeJS.ReadableStream,
    createWriteStream(dest),
  );
}

export async function processProject(projectId: string): Promise<void> {
  const db = getDb();
  const [project] = await db.select().from(projects).where(eq(projects.id, projectId));
  if (!project) throw new Error(`Project ${projectId} not found`);

  const [ws] = await db.select().from(workspaces).where(eq(workspaces.id, project.workspaceId));
  const plan = planFor(ws?.plan);
  const [preset] = ws?.brandPresetId
    ? await db.select().from(brandPresets).where(eq(brandPresets.id, ws.brandPresetId))
    : [];

  const workDir = await mkdtemp(path.join(tmpdir(), "clipforge-"));
  let sourcePath = path.join(workDir, "source");
  const audioPath = path.join(workDir, "audio.mp3");

  try {
    // ---- Stage 0: acquire media (upload already in R2, or import from URL) ----
    if (project.mediaKey) {
      await downloadTo(project.mediaKey, sourcePath);
    } else if (project.sourceUrl && project.sourceType !== "upload") {
      await setStatus(projectId, "importing");
      await audit(projectId, "import", async () => {
        const local = await importMedia(
          project.sourceType as ImportSource,
          project.sourceUrl!,
          workDir,
        );
        sourcePath = local;
        // Persist the imported media to R2 so re-renders don't re-download.
        const ext = extForContentType(local.endsWith(".mp3") ? "audio/mpeg" : "video/mp4");
        const key = `sources/${project.workspaceId}/${projectId}.${ext}`;
        await putObject(key, await readFile(local), "application/octet-stream");
        await db.update(projects).set({ mediaKey: key }).where(eq(projects.id, projectId));
        return 0;
      });
    } else {
      throw new Error(`Project ${projectId} has no media`);
    }

    const duration = await probeDurationSeconds(sourcePath);
    await db
      .update(projects)
      .set({ durationSeconds: Math.round(duration) })
      .where(eq(projects.id, projectId));

    // ---- Stage 1: transcribe (chunked for long recordings) ----
    await setStatus(projectId, "transcribing");
    let words: TranscriptWord[] = [];
    await audit(projectId, "transcribe", async () => {
      await extractAudio(sourcePath, audioPath);
      const size = (await stat(audioPath)).size;

      let result: TranscriptResult;
      if (size <= WHISPER_MAX_BYTES) {
        result = await transcribeFile(audioPath);
      } else {
        // Split into fixed-length chunks; each chunk's timestamps are offset
        // by its position in the original timeline, then merged back together.
        const segments = await segmentAudio(audioPath, workDir, SEGMENT_SECONDS);
        const parts: TranscriptResult[] = [];
        for (let i = 0; i < segments.length; i++) {
          parts.push(await transcribeFile(segments[i], i * SEGMENT_SECONDS));
        }
        result = mergeTranscripts(parts);
      }

      words = result.words;
      await db.insert(transcripts).values({
        projectId,
        language: result.language,
        fullText: result.fullText,
        wordsJson: result.words,
        whisperCostCents: result.costCents,
      });
      return result.costCents;
    });

    if (words.length === 0) throw new Error("Empty transcript");

    // ---- Stage 2: select clips + generate copy (one batch) ----
    await setStatus(projectId, "selecting");
    let candidateIds: { id: string; startMs: number; endMs: number }[] = [];
    await audit(projectId, "select", async () => {
      const [selected, copyResult] = await Promise.all([
        selectClips(words, { maxClips: 8 }),
        generateCopy(words),
      ]);

      const inserted = await db
        .insert(clipCandidates)
        .values(
          selected.map((c, i) => ({
            projectId,
            startMs: c.startMs,
            endMs: c.endMs,
            hookScore: c.hookScore,
            selfContainmentScore: c.selfContainmentScore,
            title: c.title,
            rationale: c.rationale,
            transcriptExcerpt: c.transcriptExcerpt,
            rank: i + 1,
          })),
        )
        .returning();
      candidateIds = inserted.map((r) => ({ id: r.id, startMs: r.startMs, endMs: r.endMs }));

      const { copy, tokensUsed } = copyResult;
      const outputs: {
        kind: (typeof textOutputs.kind.enumValues)[number];
        variant: string;
        contentJson: TextOutputContent;
      }[] = [
        {
          kind: "tweet_thread",
          variant: "default",
          contentJson: {
            type: "tweet_thread",
            tweets: copy.tweetThread.tweets,
            citations: copy.tweetThread.citations,
          },
        },
        {
          kind: "linkedin_post",
          variant: "narrative",
          contentJson: {
            type: "linkedin_post",
            body: copy.linkedinNarrative.body,
            citations: copy.linkedinNarrative.citations,
          },
        },
        {
          kind: "linkedin_post",
          variant: "listicle",
          contentJson: {
            type: "linkedin_post",
            body: copy.linkedinListicle.body,
            citations: copy.linkedinListicle.citations,
          },
        },
        {
          kind: "newsletter",
          variant: "default",
          contentJson: {
            type: "newsletter",
            markdown: copy.newsletter.markdown,
            citations: copy.newsletter.citations,
          },
        },
      ];
      await db.insert(textOutputs).values(
        outputs.map((o) => ({ projectId, ...o, tokensUsed, model: "claude" })),
      );
      // ~$0.65 per episode for selection+copy, rounded to cents.
      return 65;
    });

    // ---- Stage 3: render top clips (vertical 9:16 + square 1:1) ----
    await setStatus(projectId, "rendering");
    await audit(projectId, "render", async () => {
      const top = candidateIds.slice(0, RENDER_TOP_N);
      const style = preset?.captionStyle ?? "bold-center";
      const height = plan.maxExportHeight;

      for (const cand of top) {
        for (const aspect of RENDER_ASPECTS) {
          const hash = renderHash(projectId, cand.startMs, cand.endMs, style, aspect);
          const [clip] = await db
            .insert(clips)
            .values({
              projectId,
              candidateId: cand.id,
              aspect,
              captionStyle: style,
              status: "rendering",
              durationMs: cand.endMs - cand.startMs,
              renderHash: hash,
            })
            .returning();

          const outPath = path.join(workDir, `clip_${clip.id}.mp4`);
          const thumbPath = path.join(workDir, `clip_${clip.id}.jpg`);
          await renderClip({
            input: sourcePath,
            output: outPath,
            startMs: cand.startMs,
            endMs: cand.endMs,
            words,
            captionStyle: style,
            aspect,
            height,
            watermark: plan.watermark,
            workDir,
          });
          await renderThumbnail(
            outPath,
            thumbPath,
            Math.min(1000, (cand.endMs - cand.startMs) / 2),
          );

          const renderKey = `renders/${projectId}/${clip.id}.mp4`;
          const thumbKey = `renders/${projectId}/${clip.id}.jpg`;
          await putObject(renderKey, await readFile(outPath), "video/mp4");
          await putObject(thumbKey, await readFile(thumbPath), "image/jpeg");

          await db
            .update(clips)
            .set({ status: "ready", renderKey, thumbnailKey: thumbKey })
            .where(eq(clips.id, clip.id));
        }
      }
      return 0;
    });

    await setStatus(projectId, "ready");

    // Notify the workspace owner their kit is done (best-effort).
    if (ws) {
      const [owner] = await db.select().from(users).where(eq(users.id, ws.ownerUserId));
      if (owner?.email) {
        await sendReadyEmail({
          to: owner.email,
          projectTitle: project.title,
          projectId,
        }).catch(() => {});
      }
    }
  } catch (err) {
    await db
      .update(projects)
      .set({ status: "failed", error: err instanceof Error ? err.message : String(err) })
      .where(eq(projects.id, projectId));
    throw err;
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}

/** Fast-lane re-render of a single clip after the user edits bounds/style. */
export async function reRenderClip(clipId: string): Promise<void> {
  const db = getDb();
  const [clip] = await db.select().from(clips).where(eq(clips.id, clipId));
  if (!clip) throw new Error(`Clip ${clipId} not found`);
  const [project] = await db.select().from(projects).where(eq(projects.id, clip.projectId));
  if (!project?.mediaKey) throw new Error("Project media missing");
  const [t] = await db.select().from(transcripts).where(eq(transcripts.projectId, clip.projectId));
  const words = (t?.wordsJson ?? []) as TranscriptWord[];
  const [ws] = await db.select().from(workspaces).where(eq(workspaces.id, project.workspaceId));
  const plan = planFor(ws?.plan);

  // Fall back to the candidate's original bounds when only one edge was edited.
  const [cand] = clip.candidateId
    ? await db.select().from(clipCandidates).where(eq(clipCandidates.id, clip.candidateId))
    : [];
  const startMs = clip.editedStartMs ?? cand?.startMs ?? 0;
  const endMs = clip.editedEndMs ?? cand?.endMs ?? clip.durationMs ?? startMs + 30000;

  const workDir = await mkdtemp(path.join(tmpdir(), "clipforge-rr-"));
  const sourcePath = path.join(workDir, "source");
  try {
    await db.update(clips).set({ status: "rendering" }).where(eq(clips.id, clipId));
    await downloadTo(project.mediaKey, sourcePath);

    const outPath = path.join(workDir, `clip_${clip.id}.mp4`);
    const thumbPath = path.join(workDir, `clip_${clip.id}.jpg`);
    await renderClip({
      input: sourcePath,
      output: outPath,
      startMs,
      endMs,
      words,
      captionStyle: clip.captionStyle,
      aspect: clip.aspect,
      height: plan.maxExportHeight,
      watermark: plan.watermark,
      workDir,
    });
    await renderThumbnail(outPath, thumbPath, Math.min(1000, (endMs - startMs) / 2));
    const renderKey = `renders/${clip.projectId}/${clip.id}.mp4`;
    const thumbKey = `renders/${clip.projectId}/${clip.id}.jpg`;
    await putObject(renderKey, await readFile(outPath), "video/mp4");
    await putObject(thumbKey, await readFile(thumbPath), "image/jpeg");
    await db
      .update(clips)
      .set({
        status: "ready",
        renderKey,
        thumbnailKey: thumbKey,
        durationMs: endMs - startMs,
        renderHash: renderHash(clip.projectId, startMs, endMs, clip.captionStyle, clip.aspect),
      })
      .where(eq(clips.id, clipId));
  } catch (err) {
    await db.update(clips).set({ status: "failed" }).where(eq(clips.id, clipId));
    throw err;
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}

export async function handleJob(job: PipelineJob): Promise<void> {
  switch (job.type) {
    case "process_project":
    case "import_and_process":
      return processProject(job.projectId);
    case "render_clip":
      return reRenderClip(job.clipId);
  }
}

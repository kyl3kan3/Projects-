"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { msToClock, STATUS_LABELS } from "@/lib/utils";
import type { TextOutputContent } from "@/db/schema";

const EASE_OUT_EXPO = [0.16, 1, 0.3, 1] as const;
const SPRING_GENTLE = { type: "spring", stiffness: 170, damping: 26 } as const;

interface ClipDto {
  id: string;
  candidateId: string | null;
  aspect: string;
  captionStyle: string;
  status: string;
  durationMs: number | null;
  editedStartMs: number | null;
  editedEndMs: number | null;
  videoUrl: string | null;
  thumbnailUrl: string | null;
}
interface CandidateDto {
  id: string;
  title: string;
  startMs: number;
  endMs: number;
  hookScore: number;
  selfContainmentScore: number;
  rationale: string | null;
  transcriptExcerpt: string | null;
  rank: number;
}
interface TextDto {
  id: string;
  kind: string;
  variant: string;
  contentJson: TextOutputContent;
  editedContentJson: TextOutputContent | null;
}
interface ProjectDto {
  id: string;
  title: string;
  status: string;
  error: string | null;
  durationSeconds: number | null;
}
interface Payload {
  project: ProjectDto;
  clips: ClipDto[];
  candidates: CandidateDto[];
  textOutputs: TextDto[];
}

const ACTIVE = ["uploaded", "importing", "transcribing", "selecting", "rendering"];

export function ProjectView({ projectId }: { projectId: string }) {
  const [data, setData] = useState<Payload | null>(null);
  const [tab, setTab] = useState<"clips" | "text">("clips");

  const load = useCallback(async () => {
    const res = await fetch(`/api/projects/${projectId}`, { cache: "no-store" });
    if (res.ok) setData(await res.json());
  }, [projectId]);

  useEffect(() => {
    load();
  }, [load]);

  // Poll while the project (or any clip) is still working.
  useEffect(() => {
    const active =
      !data ||
      ACTIVE.includes(data.project.status) ||
      data.clips.some((c) => c.status === "rendering" || c.status === "pending");
    if (!active) return;
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, [data, load]);

  if (!data) {
    return <div className="text-[var(--color-muted)]">Loading…</div>;
  }

  const { project, clips, candidates, textOutputs } = data;
  const processing = ACTIVE.includes(project.status);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <Link href="/dashboard" className="text-sm text-[var(--color-muted)] hover:text-white">
            ← Dashboard
          </Link>
          <h1 className="mt-1 font-display text-2xl font-bold">{project.title}</h1>
        </div>
        {/* Status pill morphs between stages; a cyan ring pulses on ready. */}
        <div className="relative">
          <AnimatePresence mode="wait">
            <motion.span
              key={project.status}
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 6 }}
              transition={{ duration: 0.24, ease: EASE_OUT_EXPO }}
              className={`badge ${
                project.status === "ready"
                  ? "pulse-ring text-emerald-300"
                  : project.status === "failed"
                    ? "text-red-300"
                    : "text-[var(--color-accent)]"
              }`}
            >
              {STATUS_LABELS[project.status] ?? project.status}
            </motion.span>
          </AnimatePresence>
        </div>
      </div>

      {processing && <ProgressBar status={project.status} />}
      {project.status === "failed" && (
        <div className="card mb-6 border-red-500/40 p-4 text-sm text-red-300">
          Processing failed: {project.error ?? "unknown error"}
        </div>
      )}

      <div className="mb-4 flex gap-2">
        <button
          onClick={() => setTab("clips")}
          className={`badge ${tab === "clips" ? "text-white" : ""}`}
          style={tab === "clips" ? { borderColor: "var(--color-brand)" } : {}}
        >
          Clips ({clips.length})
        </button>
        <button
          onClick={() => setTab("text")}
          className={`badge ${tab === "text" ? "text-white" : ""}`}
          style={tab === "text" ? { borderColor: "var(--color-brand)" } : {}}
        >
          Written assets ({textOutputs.length})
        </button>
      </div>

      {tab === "clips" ? (
        <ClipsGrid clips={clips} candidates={candidates} onChange={load} />
      ) : (
        <TextAssets outputs={textOutputs} />
      )}
    </div>
  );
}

function ProgressBar({ status }: { status: string }) {
  const stages = [
    { key: "transcribing", label: "Transcribing" },
    { key: "selecting", label: "Finding clips" },
    { key: "rendering", label: "Rendering" },
    { key: "ready", label: "Ready" },
  ];
  const idx = Math.max(0, stages.findIndex((s) => s.key === status));
  return (
    <div className="card mb-6 p-4">
      <div className="mb-3 flex items-center gap-2 text-sm text-[var(--color-muted)]">
        <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-[var(--color-accent)]" />
        Building your content kit — this usually takes 5–15 minutes.
      </div>
      <div className="flex gap-1">
        {stages.map((s, i) => (
          <div key={s.key} className="flex-1">
            <div
              className={`h-1.5 overflow-hidden rounded-full ${
                i < idx
                  ? "bg-[var(--color-brand)]"
                  : i === idx
                    ? "scan bg-[var(--color-panel-2)]"
                    : "bg-[var(--color-panel-2)]"
              }`}
            />
            <div
              className={`mt-1.5 text-[10px] uppercase tracking-wide ${
                i <= idx ? "text-[var(--color-accent)]" : "text-[var(--color-muted)]"
              }`}
            >
              {s.label}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const ASPECT_LABEL: Record<string, string> = { "9x16": "9:16", "1x1": "1:1", "16x9": "16:9" };
const ASPECT_CLASS: Record<string, string> = {
  "9x16": "aspect-[9/16]",
  "1x1": "aspect-square",
  "16x9": "aspect-video",
};

function ClipsGrid({
  clips,
  candidates,
  onChange,
}: {
  clips: ClipDto[];
  candidates: CandidateDto[];
  onChange: () => void;
}) {
  if (clips.length === 0) {
    return (
      <div className="card p-8 text-center text-sm text-[var(--color-muted)]">
        Clips will appear here as they finish rendering.
      </div>
    );
  }
  // Group clip variants (9:16, 1:1, …) under their source candidate.
  const groups = candidates
    .map((cand) => ({
      candidate: cand,
      variants: clips.filter((c) => c.candidateId === cand.id),
    }))
    .filter((g) => g.variants.length > 0);
  // Any orphan clips (no candidate) still render on their own.
  const orphans = clips.filter((c) => !c.candidateId);

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {groups.map((g, i) => (
        <motion.div
          key={g.candidate.id}
          initial={{ opacity: 0.001, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...SPRING_GENTLE, delay: Math.min(i, 8) * 0.04 }}
        >
          <ClipCard candidate={g.candidate} variants={g.variants} onChange={onChange} />
        </motion.div>
      ))}
      {orphans.map((clip) => (
        <ClipCard key={clip.id} variants={[clip]} onChange={onChange} />
      ))}
    </div>
  );
}

function ClipCard({
  candidate,
  variants,
  onChange,
}: {
  candidate?: CandidateDto;
  variants: ClipDto[];
  onChange: () => void;
}) {
  const aspects = variants.map((v) => v.aspect);
  const [activeAspect, setActiveAspect] = useState(aspects[0]);
  const clip = variants.find((v) => v.aspect === activeAspect) ?? variants[0];

  const [style, setStyle] = useState(clip.captionStyle);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [startS, setStartS] = useState(() => secOf(candidate?.startMs, clip.editedStartMs));
  const [endS, setEndS] = useState(() => secOf(candidate?.endMs, clip.editedEndMs));

  // Apply an edit to every aspect variant of this clip, then re-render each.
  async function patchAll(body: Record<string, unknown>) {
    setSaving(true);
    await Promise.all(
      variants.map((v) =>
        fetch(`/api/clips/${v.id}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        }),
      ),
    );
    setSaving(false);
    onChange();
  }

  async function restyle(next: string) {
    setStyle(next);
    await patchAll({ captionStyle: next });
  }

  async function saveTrim() {
    const startMs = Math.max(0, Math.round(startS * 1000));
    const endMs = Math.round(endS * 1000);
    if (endMs <= startMs) return;
    setEditing(false);
    await patchAll({ editedStartMs: startMs, editedEndMs: endMs });
  }

  const rendering = clip.status === "rendering" || clip.status === "pending" || saving;

  return (
    <div className="card card-lift overflow-hidden">
      <div className={`relative bg-black ${ASPECT_CLASS[clip.aspect] ?? "aspect-[9/16]"} ${rendering ? "shimmer" : ""}`}>
        {clip.status === "ready" && clip.videoUrl && !saving ? (
          <video
            key={clip.id}
            src={clip.videoUrl}
            poster={clip.thumbnailUrl ?? undefined}
            controls
            className="develop-in h-full w-full object-cover"
          />
        ) : (
          <div className="scan flex h-full items-center justify-center text-xs text-[var(--color-muted)]">
            {rendering ? "Developing…" : clip.status === "failed" ? "Render failed" : "Waiting"}
          </div>
        )}
      </div>
      <div className="p-3">
        <div className="flex items-center justify-between">
          <div className="truncate text-sm font-medium">{candidate?.title ?? "Clip"}</div>
          {candidate && <span className="badge text-[10px]">🎣 {candidate.hookScore}</span>}
        </div>
        {candidate && (
          <div className="mono mt-1 text-[11px] text-[var(--color-muted)]">
            {msToClock(clip.editedStartMs ?? candidate.startMs)}–
            {msToClock(clip.editedEndMs ?? candidate.endMs)}
          </div>
        )}

        {/* aspect switch */}
        {variants.length > 1 && (
          <div className="mt-3 flex gap-1">
            {variants.map((v) => (
              <button
                key={v.id}
                onClick={() => setActiveAspect(v.aspect)}
                className={`badge text-[10px] ${v.aspect === activeAspect ? "text-white" : ""}`}
                style={v.aspect === activeAspect ? { borderColor: "var(--color-brand)" } : {}}
              >
                {ASPECT_LABEL[v.aspect] ?? v.aspect}
              </button>
            ))}
          </div>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <select
            value={style}
            onChange={(e) => restyle(e.target.value)}
            disabled={saving}
            className="input py-1 text-xs"
            style={{ width: "auto" }}
          >
            <option value="bold-center">Bold center</option>
            <option value="clean-bottom">Clean bottom</option>
            <option value="pop-yellow">Pop yellow</option>
          </select>
          {candidate && (
            <button
              onClick={() => setEditing((v) => !v)}
              disabled={saving}
              className="btn btn-ghost px-2 py-1 text-xs"
            >
              Trim
            </button>
          )}
          {clip.status === "ready" && clip.videoUrl && (
            <a href={clip.videoUrl} download className="btn btn-ghost px-2 py-1 text-xs">
              Download
            </a>
          )}
        </div>

        {editing && (
          <div className="mt-3 rounded-lg bg-[var(--color-panel-2)] p-3 text-xs">
            <div className="mb-2 text-[var(--color-muted)]">Trim (seconds)</div>
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-1">
                Start
                <input
                  type="number"
                  min={0}
                  step={0.5}
                  value={startS}
                  onChange={(e) => setStartS(Number(e.target.value))}
                  className="input mono w-20 py-1"
                />
              </label>
              <label className="flex items-center gap-1">
                End
                <input
                  type="number"
                  min={0}
                  step={0.5}
                  value={endS}
                  onChange={(e) => setEndS(Number(e.target.value))}
                  className="input mono w-20 py-1"
                />
              </label>
            </div>
            <button onClick={saveTrim} disabled={saving} className="btn btn-primary mt-3 px-3 py-1 text-xs">
              {saving ? "Rendering…" : "Save & re-render"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function secOf(candidateMs: number | undefined, editedMs: number | null): number {
  const ms = editedMs ?? candidateMs ?? 0;
  return Math.round(ms / 100) / 10;
}

function TextAssets({ outputs }: { outputs: TextDto[] }) {
  if (outputs.length === 0) {
    return (
      <div className="card p-8 text-center text-sm text-[var(--color-muted)]">
        Written assets appear here once the transcript is analyzed.
      </div>
    );
  }
  return (
    <div className="space-y-4">
      {outputs.map((o) => (
        <TextCard key={o.id} output={o} />
      ))}
    </div>
  );
}

function toPlain(c: TextOutputContent): string {
  return c.type === "tweet_thread"
    ? c.tweets.join("\n\n")
    : c.type === "linkedin_post"
      ? c.body
      : c.markdown;
}

function TextCard({ output }: { output: TextDto }) {
  const original = output.editedContentJson ?? output.contentJson;
  const [content, setContent] = useState<TextOutputContent>(original);
  const [editing, setEditing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);
  const isEdited = output.editedContentJson != null;

  const label =
    output.kind === "tweet_thread"
      ? "Tweet thread"
      : output.kind === "linkedin_post"
        ? `LinkedIn (${output.variant})`
        : "Newsletter";

  async function copy() {
    await navigator.clipboard.writeText(toPlain(content));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  async function save() {
    setSaving(true);
    await fetch(`/api/text/${output.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content }),
    });
    setSaving(false);
    setEditing(false);
  }

  function setTweet(i: number, val: string) {
    if (content.type !== "tweet_thread") return;
    const tweets = [...content.tweets];
    tweets[i] = val;
    setContent({ ...content, tweets });
  }

  return (
    <div className="card p-5">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-display font-semibold">
          {label}
          {isEdited && <span className="badge ml-2 text-[10px]">edited</span>}
        </h3>
        <div className="flex gap-2">
          <button onClick={() => setEditing((v) => !v)} className="btn btn-ghost text-xs">
            {editing ? "Done" : "Edit"}
          </button>
          <button onClick={copy} className="btn btn-ghost text-xs">
            {copied ? "Copied!" : "Copy"}
          </button>
        </div>
      </div>

      {content.type === "tweet_thread" ? (
        <ol className="space-y-3">
          {content.tweets.map((t, i) => (
            <li key={i} className="rounded-lg bg-[var(--color-panel-2)] p-3 text-sm">
              <span className="mono mr-2 text-[var(--color-muted)]">
                {i + 1}/{content.tweets.length}
              </span>
              {editing ? (
                <textarea
                  value={t}
                  onChange={(e) => setTweet(i, e.target.value)}
                  rows={2}
                  className="input mt-1 text-sm"
                />
              ) : (
                t
              )}
            </li>
          ))}
        </ol>
      ) : editing ? (
        <textarea
          value={content.type === "linkedin_post" ? content.body : content.markdown}
          onChange={(e) =>
            setContent(
              content.type === "linkedin_post"
                ? { ...content, body: e.target.value }
                : { ...content, markdown: e.target.value },
            )
          }
          rows={10}
          className="input text-sm"
        />
      ) : (
        <pre className="whitespace-pre-wrap font-sans text-sm text-[#dfe5f3]">{toPlain(content)}</pre>
      )}

      {editing && (
        <button onClick={save} disabled={saving} className="btn btn-primary mt-3 text-xs">
          {saving ? "Saving…" : "Save edits"}
        </button>
      )}

      {"citations" in content && content.citations.length > 0 && (
        <details className="mt-3 text-xs text-[var(--color-muted)]">
          <summary className="cursor-pointer">Sources ({content.citations.length})</summary>
          <ul className="mt-2 space-y-1">
            {content.citations.map((cit, i) => (
              <li key={i}>
                <span className="mono text-[var(--color-accent)]">[{msToClock(cit.timestampMs)}]</span>{" "}
                “{cit.quote}”
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

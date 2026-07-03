"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { msToClock, STATUS_LABELS } from "@/lib/utils";
import type { TextOutputContent } from "@/db/schema";

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
          <h1 className="mt-1 text-2xl font-bold">{project.title}</h1>
        </div>
        <span
          className={`badge ${
            project.status === "ready"
              ? "text-emerald-300"
              : project.status === "failed"
                ? "text-red-300"
                : "text-[var(--color-accent)]"
          }`}
        >
          {STATUS_LABELS[project.status] ?? project.status}
        </span>
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
  const stages = ["transcribing", "selecting", "rendering", "ready"];
  const idx = Math.max(0, stages.indexOf(status));
  return (
    <div className="card mb-6 p-4">
      <div className="mb-2 text-sm text-[var(--color-muted)]">
        Building your content kit — this usually takes 5–15 minutes.
      </div>
      <div className="flex gap-1">
        {stages.map((s, i) => (
          <div
            key={s}
            className={`h-1.5 flex-1 rounded-full ${
              i <= idx ? "bg-[var(--color-brand)]" : "bg-[var(--color-panel-2)]"
            }`}
          />
        ))}
      </div>
    </div>
  );
}

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
  const byCandidate = new Map(candidates.map((c) => [c.id, c]));
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {clips.map((clip) => (
        <ClipCard
          key={clip.id}
          clip={clip}
          candidate={clip.candidateId ? byCandidate.get(clip.candidateId) : undefined}
          onChange={onChange}
        />
      ))}
    </div>
  );
}

function ClipCard({
  clip,
  candidate,
  onChange,
}: {
  clip: ClipDto;
  candidate?: CandidateDto;
  onChange: () => void;
}) {
  const [style, setStyle] = useState(clip.captionStyle);
  const [saving, setSaving] = useState(false);

  async function restyle(next: string) {
    setStyle(next);
    setSaving(true);
    await fetch(`/api/clips/${clip.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ captionStyle: next }),
    });
    setSaving(false);
    onChange();
  }

  return (
    <div className="card overflow-hidden">
      <div className="relative aspect-[9/16] bg-black">
        {clip.status === "ready" && clip.videoUrl ? (
          <video
            src={clip.videoUrl}
            poster={clip.thumbnailUrl ?? undefined}
            controls
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-[var(--color-muted)]">
            {clip.status === "rendering" || clip.status === "pending"
              ? "Rendering…"
              : clip.status === "failed"
                ? "Render failed"
                : "Waiting"}
          </div>
        )}
      </div>
      <div className="p-3">
        <div className="flex items-center justify-between">
          <div className="truncate text-sm font-medium">{candidate?.title ?? "Clip"}</div>
          {candidate && (
            <span className="badge text-[10px]">🎣 {candidate.hookScore}</span>
          )}
        </div>
        {candidate && (
          <div className="mt-1 text-[11px] text-[var(--color-muted)]">
            {msToClock(candidate.startMs)}–{msToClock(candidate.endMs)}
          </div>
        )}
        <div className="mt-3 flex items-center gap-2">
          <select
            value={style}
            onChange={(e) => restyle(e.target.value)}
            disabled={saving}
            className="input py-1 text-xs"
          >
            <option value="bold-center">Bold center</option>
            <option value="clean-bottom">Clean bottom</option>
            <option value="pop-yellow">Pop yellow</option>
          </select>
          {clip.status === "ready" && clip.videoUrl && (
            <a href={clip.videoUrl} download className="btn btn-ghost px-2 py-1 text-xs">
              Download
            </a>
          )}
        </div>
      </div>
    </div>
  );
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

function TextCard({ output }: { output: TextDto }) {
  const [copied, setCopied] = useState(false);
  const c = output.contentJson;

  const plain =
    c.type === "tweet_thread"
      ? c.tweets.join("\n\n")
      : c.type === "linkedin_post"
        ? c.body
        : c.markdown;

  const label =
    output.kind === "tweet_thread"
      ? "Tweet thread"
      : output.kind === "linkedin_post"
        ? `LinkedIn (${output.variant})`
        : "Newsletter";

  async function copy() {
    await navigator.clipboard.writeText(plain);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="card p-5">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-semibold">{label}</h3>
        <button onClick={copy} className="btn btn-ghost text-xs">
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>
      {c.type === "tweet_thread" ? (
        <ol className="space-y-3">
          {c.tweets.map((t, i) => (
            <li key={i} className="rounded-lg bg-[var(--color-panel-2)] p-3 text-sm">
              <span className="mr-2 text-[var(--color-muted)]">{i + 1}/{c.tweets.length}</span>
              {t}
            </li>
          ))}
        </ol>
      ) : (
        <pre className="whitespace-pre-wrap font-sans text-sm text-[#dfe5f3]">{plain}</pre>
      )}
      {"citations" in c && c.citations.length > 0 && (
        <details className="mt-3 text-xs text-[var(--color-muted)]">
          <summary className="cursor-pointer">Sources ({c.citations.length})</summary>
          <ul className="mt-2 space-y-1">
            {c.citations.map((cit, i) => (
              <li key={i}>
                <span className="text-[var(--color-accent)]">[{msToClock(cit.timestampMs)}]</span>{" "}
                “{cit.quote}”
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

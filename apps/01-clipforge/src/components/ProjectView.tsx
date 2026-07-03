"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { msToClock, STATUS_LABELS } from "@/lib/utils";
import { IconRefresh, IconChevronLeft } from "./icons";
import type { TextOutputContent } from "@/db/schema";

const EASE = [0.25, 1, 0.5, 1] as const;
const SPRING = { type: "spring", stiffness: 210, damping: 30 } as const;

interface ClipDto {
  id: string; candidateId: string | null; aspect: string; captionStyle: string;
  status: string; durationMs: number | null; editedStartMs: number | null;
  editedEndMs: number | null; videoUrl: string | null; thumbnailUrl: string | null;
}
interface CandidateDto {
  id: string; title: string; startMs: number; endMs: number; hookScore: number;
  selfContainmentScore: number; rationale: string | null; transcriptExcerpt: string | null; rank: number;
}
interface TextDto {
  id: string; kind: string; variant: string;
  contentJson: TextOutputContent; editedContentJson: TextOutputContent | null;
}
interface ProjectDto { id: string; title: string; status: string; error: string | null; durationSeconds: number | null; }
interface Payload { project: ProjectDto; clips: ClipDto[]; candidates: CandidateDto[]; textOutputs: TextDto[]; }

const ACTIVE = ["uploaded", "importing", "transcribing", "selecting", "rendering"];
const STAGES = ["transcribing", "selecting", "rendering", "ready"];

export function ProjectView({ projectId }: { projectId: string }) {
  const [data, setData] = useState<Payload | null>(null);
  const [tab, setTab] = useState<"clips" | "text">("clips");
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/projects/${projectId}`, { cache: "no-store" });
    if (res.ok) setData(await res.json());
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const active =
      !data || ACTIVE.includes(data.project.status) ||
      data.clips.some((c) => c.status === "rendering" || c.status === "pending");
    if (!active) return;
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, [data, load]);

  async function manualRefresh() {
    setRefreshing(true);
    await load();
    setTimeout(() => setRefreshing(false), 400);
  }

  if (!data) {
    return <div className="px-5 py-16 text-center text-sm text-[var(--color-muted)]">Loading…</div>;
  }
  const { project, clips, candidates, textOutputs } = data;
  const processing = ACTIVE.includes(project.status);
  const pillCls = project.status === "ready" ? "is-ready" : project.status === "failed" ? "is-failed" : "is-active";

  return (
    <div className="pb-28">
      {/* Sticky top bar with live stage pill */}
      <div className="sticky top-0 z-20 -mx-5 mb-3 border-b border-[var(--color-line)] bg-[var(--color-ink)]/90 px-5 py-3 backdrop-blur">
        <div className="flex items-center justify-between gap-3">
          <Link href="/dashboard" className="flex min-h-[44px] items-center gap-1 text-sm text-[var(--color-muted)]"><IconChevronLeft size={18} /> Projects</Link>
          <div className="flex items-center gap-2">
            <button onClick={manualRefresh} aria-label="Refresh" className="text-[var(--color-muted)]">
              <span className={refreshing ? "inline-block animate-spin" : "inline-block"}><IconRefresh size={18} /></span>
            </button>
            <AnimatePresence mode="wait">
              <motion.span
                key={project.status}
                initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 4 }}
                transition={{ duration: 0.2, ease: EASE }}
                className={`stage-pill ${pillCls} ${project.status === "ready" ? "pulse-once" : ""}`}
              >
                <span className="dot" />
                {STATUS_LABELS[project.status] ?? project.status}
              </motion.span>
            </AnimatePresence>
          </div>
        </div>
        <h1 className="mt-2 font-display text-xl font-bold leading-tight">{project.title}</h1>
      </div>

      {processing && <ProgressStages status={project.status} />}
      {project.status === "failed" && (
        <div
          className="mb-4 rounded-[14px] p-4 text-sm"
          style={{ background: "rgba(242,109,109,0.08)", color: "var(--color-danger)" }}
        >
          Processing failed: {project.error ?? "unknown error"}
        </div>
      )}

      {/* Tabs */}
      <div className="chip-row mb-4">
        <button className="chip" data-active={tab === "clips"} onClick={() => setTab("clips")}>
          Clips ({clips.length})
        </button>
        <button className="chip" data-active={tab === "text"} onClick={() => setTab("text")}>
          Written assets ({textOutputs.length})
        </button>
      </div>

      {tab === "clips"
        ? <ClipsList clips={clips} candidates={candidates} onChange={load} />
        : <TextList outputs={textOutputs} />}
    </div>
  );
}

function ProgressStages({ status }: { status: string }) {
  const idx = Math.max(0, STAGES.indexOf(status));
  const labels = ["Transcribing", "Finding clips", "Rendering", "Ready"];
  return (
    <div className="card mb-4 p-4">
      <div className="mb-3 flex items-center gap-2 text-sm text-[var(--color-muted)]">
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--color-brand)]" />
        Building your kit — usually 5–15 minutes.
      </div>
      <div className="flex gap-1.5">
        {labels.map((l, i) => (
          <div key={l} className="flex-1">
            <div className={`h-1.5 overflow-hidden rounded-full ${i < idx ? "bg-[var(--color-brand)]" : "bg-[var(--color-panel-2)]"} ${i === idx ? "sheen" : ""}`} />
            <div className={`t-label mt-2 ${i <= idx ? "text-[var(--color-brand)]" : "text-[var(--color-faint)]"}`}>{l}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

const ASPECT_LABEL: Record<string, string> = { "9x16": "9:16", "1x1": "1:1", "16x9": "16:9" };
const ASPECT_CLASS: Record<string, string> = { "9x16": "aspect-[9/16]", "1x1": "aspect-square", "16x9": "aspect-video" };

function ClipsList({ clips, candidates, onChange }: { clips: ClipDto[]; candidates: CandidateDto[]; onChange: () => void }) {
  if (clips.length === 0) {
    return <p className="py-12 text-center text-sm text-[var(--color-muted)]">Clips appear here as they finish rendering.</p>;
  }
  const groups = candidates
    .map((cand) => ({ candidate: cand, variants: clips.filter((c) => c.candidateId === cand.id) }))
    .filter((g) => g.variants.length > 0);
  const orphans = clips.filter((c) => !c.candidateId);

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {groups.map((g, i) => (
        <motion.div key={g.candidate.id} initial={{ opacity: 0.001, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ ...SPRING, delay: Math.min(i, 8) * 0.03 }}>
          <ClipCard candidate={g.candidate} variants={g.variants} onChange={onChange} />
        </motion.div>
      ))}
      {orphans.map((c) => <ClipCard key={c.id} variants={[c]} onChange={onChange} />)}
    </div>
  );
}

function ClipCard({ candidate, variants, onChange }: { candidate?: CandidateDto; variants: ClipDto[]; onChange: () => void }) {
  const aspects = variants.map((v) => v.aspect);
  const [activeAspect, setActiveAspect] = useState(aspects[0]);
  const clip = variants.find((v) => v.aspect === activeAspect) ?? variants[0];
  const [style, setStyle] = useState(clip.captionStyle);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [startS, setStartS] = useState(() => secOf(candidate?.startMs, clip.editedStartMs));
  const [endS, setEndS] = useState(() => secOf(candidate?.endMs, clip.editedEndMs));

  async function patchAll(body: Record<string, unknown>) {
    setSaving(true);
    await Promise.all(variants.map((v) =>
      fetch(`/api/clips/${v.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })));
    setSaving(false);
    onChange();
  }
  async function restyle(next: string) { setStyle(next); await patchAll({ captionStyle: next }); }
  async function saveTrim() {
    const s = Math.max(0, Math.round(startS * 1000)), e = Math.round(endS * 1000);
    if (e <= s) return;
    setEditing(false);
    await patchAll({ editedStartMs: s, editedEndMs: e });
  }
  const rendering = clip.status === "rendering" || clip.status === "pending" || saving;

  return (
    <div className="card overflow-hidden">
      <div
        className={`relative overflow-hidden bg-[var(--color-raised)] ${ASPECT_CLASS[clip.aspect] ?? "aspect-[9/16]"} ${rendering ? "sheen developing" : ""}`}
      >
        {clip.status === "ready" && clip.videoUrl && !saving ? (
          <>
            <video key={clip.id} src={clip.videoUrl} poster={clip.thumbnailUrl ?? undefined} controls playsInline
              className="develop-in h-full w-full object-cover" />
            {/* the signature: amber line rides the develop edge, once */}
            <span key={`edge-${clip.id}`} className="develop-edge" />
          </>
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-[var(--color-faint)]">
            {rendering ? "Developing…" : clip.status === "failed" ? "Render failed" : "Waiting"}
          </div>
        )}
      </div>
      <div className="p-3">
        <div className="flex items-center justify-between gap-2">
          <div className="truncate text-sm font-medium">{candidate?.title ?? "Clip"}</div>
          {candidate && <span className="badge mono shrink-0">HOOK {candidate.hookScore}</span>}
        </div>
        {candidate && (
          <div className="mono mt-1 text-[11px] text-[var(--color-muted)]">
            {msToClock(clip.editedStartMs ?? candidate.startMs)}–{msToClock(clip.editedEndMs ?? candidate.endMs)}
          </div>
        )}

        {variants.length > 1 && (
          <div className="chip-row mt-3">
            {variants.map((v) => (
              <button key={v.id} className="chip" data-active={v.aspect === activeAspect} onClick={() => setActiveAspect(v.aspect)}>
                {ASPECT_LABEL[v.aspect] ?? v.aspect}
              </button>
            ))}
          </div>
        )}

        {/* caption styles scroll horizontally on phone */}
        <div className="chip-row mt-2">
          {(["bold-center", "clean-bottom", "pop-yellow"] as const).map((s) => (
            <button key={s} className="chip" data-active={style === s} disabled={saving} onClick={() => restyle(s)}>
              {s.replace("-", " ")}
            </button>
          ))}
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2">
          {candidate && (
            <button onClick={() => setEditing((v) => !v)} disabled={saving} className="btn btn-ghost">Trim</button>
          )}
          {clip.status === "ready" && clip.videoUrl && (
            <a href={clip.videoUrl} download className={`btn btn-primary ${candidate ? "" : "col-span-2"}`}>Download</a>
          )}
        </div>

        <AnimatePresence>
          {editing && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2, ease: EASE }} className="overflow-hidden">
              <div className="well mt-3 rounded-[14px] p-3 text-xs">
                <div className="mb-2 text-[var(--color-muted)]">Trim (seconds)</div>
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-1">Start
                    <input type="number" min={0} step={0.5} value={startS} onChange={(e) => setStartS(Number(e.target.value))} className="input mono ml-1 w-20 py-2" /></label>
                  <label className="flex items-center gap-1">End
                    <input type="number" min={0} step={0.5} value={endS} onChange={(e) => setEndS(Number(e.target.value))} className="input mono ml-1 w-20 py-2" /></label>
                </div>
                <button onClick={saveTrim} disabled={saving} className="btn btn-primary btn-block mt-3">
                  {saving ? "Rendering…" : "Save & re-render"}
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function secOf(candidateMs: number | undefined, editedMs: number | null): number {
  const ms = editedMs ?? candidateMs ?? 0;
  return Math.round(ms / 100) / 10;
}

function toPlain(c: TextOutputContent): string {
  return c.type === "tweet_thread" ? c.tweets.join("\n\n") : c.type === "linkedin_post" ? c.body : c.markdown;
}

function TextList({ outputs }: { outputs: TextDto[] }) {
  if (outputs.length === 0) {
    return <p className="py-12 text-center text-sm text-[var(--color-muted)]">Written assets appear here once the transcript is analyzed.</p>;
  }
  return <div className="space-y-4">{outputs.map((o) => <TextCard key={o.id} output={o} />)}</div>;
}

function TextCard({ output }: { output: TextDto }) {
  const [content, setContent] = useState<TextOutputContent>(output.editedContentJson ?? output.contentJson);
  const [editing, setEditing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);
  const isEdited = output.editedContentJson != null;
  const label = output.kind === "tweet_thread" ? "Tweet thread" : output.kind === "linkedin_post" ? `LinkedIn (${output.variant})` : "Newsletter";

  async function copy() {
    try { await navigator.clipboard.writeText(toPlain(content)); } catch {}
    setCopied(true); setTimeout(() => setCopied(false), 1400);
  }
  async function save() {
    setSaving(true);
    await fetch(`/api/text/${output.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ content }) });
    setSaving(false); setEditing(false);
  }
  function setTweet(i: number, val: string) {
    if (content.type !== "tweet_thread") return;
    const tweets = [...content.tweets]; tweets[i] = val; setContent({ ...content, tweets });
  }

  return (
    <div className="card p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="font-display font-semibold">
          {label}{isEdited && <span className="badge ml-2">edited</span>}
        </h3>
        <div className="flex gap-2">
          <button onClick={() => setEditing((v) => !v)} className="btn btn-ghost px-3 py-2 text-xs">{editing ? "Done" : "Edit"}</button>
          <button onClick={copy} className="btn btn-ghost px-3 py-2 text-xs">{copied ? "Copied!" : "Copy"}</button>
        </div>
      </div>

      {content.type === "tweet_thread" ? (
        <ol className="space-y-2.5">
          {content.tweets.map((t, i) => (
            <li key={i} className="well p-3 text-sm leading-relaxed">
              <span className="mono mr-2 text-[var(--color-muted)]">{i + 1}/{content.tweets.length}</span>
              {editing ? <textarea value={t} onChange={(e) => setTweet(i, e.target.value)} rows={2} className="input mt-1 text-sm" /> : t}
            </li>
          ))}
        </ol>
      ) : editing ? (
        <textarea
          value={content.type === "linkedin_post" ? content.body : content.markdown}
          onChange={(e) => setContent(content.type === "linkedin_post" ? { ...content, body: e.target.value } : { ...content, markdown: e.target.value })}
          rows={9} className="input text-sm" />
      ) : (
        <pre className="whitespace-pre-wrap font-sans text-sm text-[#dfe5f3]">{toPlain(content)}</pre>
      )}

      {editing && <button onClick={save} disabled={saving} className="btn btn-primary btn-block mt-3">{saving ? "Saving…" : "Save edits"}</button>}

      {"citations" in content && content.citations.length > 0 && (
        <details className="mt-3 text-xs text-[var(--color-muted)]">
          <summary className="cursor-pointer">Sources ({content.citations.length})</summary>
          <ul className="mt-2 space-y-1">
            {content.citations.map((cit, i) => (
              <li key={i}><span className="mono text-[var(--color-accent)]">[{msToClock(cit.timestampMs)}]</span> “{cit.quote}”</li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

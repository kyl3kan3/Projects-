/**
 * HTML shell and the shared components.
 *
 * Server-rendered strings, no client framework: the dashboard is four read-mostly
 * screens plus two toggles, and the manifest's stack is a Probot server. Every
 * value that reaches the page goes through `esc` — the data includes repository
 * names, pull-request titles and model text, all of it ultimately attacker
 * influenced.
 */

import { icon } from "./icons";

export function esc(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export type Tab = "reviews" | "repos" | "rulebook" | "account" | null;

export interface PageOptions {
  title: string;
  activeTab?: Tab;
  /** Rendered above the tab bar; omitted on the sign-in screen. */
  showTabs?: boolean;
  installationId?: string | null;
  login?: string | null;
  bodyClass?: string;
}

export function page(options: PageOptions, body: string): string {
  const tabs = options.showTabs === false ? "" : tabBar(options.activeTab ?? null, options.installationId ?? null);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#0D1117">
<title>${esc(options.title)}</title>
<link rel="preload" href="/fonts/inter-latin-var.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="/fonts/jetbrains-mono-latin-var.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/assets/app.css">
<link rel="icon" href="/assets/icon.svg" type="image/svg+xml">
</head>
<body class="${esc(options.bodyClass ?? "")}">
<header class="topbar">
  <a class="brand" href="/app">${icon("merge-node", 22)}<span>MergeMate</span></a>
  ${
    options.login
      ? `<form method="post" action="/logout"><button class="btn-quiet" type="submit">Sign out ${esc(options.login)}</button></form>`
      : ""
  }
</header>
<main class="wrap">
${body}
</main>
${tabs}
</body>
</html>`;
}

function tabBar(active: Tab, installationId: string | null): string {
  const base = installationId ? `/app/installations/${encodeURIComponent(installationId)}` : "/app";
  const items: { tab: Tab; href: string; label: string }[] = [
    { tab: "reviews", href: base, label: "Reviews" },
    { tab: "repos", href: `${base}/repositories`, label: "Repos" },
    { tab: "rulebook", href: `${base}/rulebook`, label: "Rulebook" },
    { tab: "account", href: `${base}/account`, label: "Account" },
  ];
  return `<nav class="tabbar" aria-label="Sections">${items
    .map(
      (item) =>
        `<a href="${esc(item.href)}"${item.tab === active ? ' aria-current="page"' : ""}>${icon(
          item.tab as never,
          22,
        )}<span>${esc(item.label)}</span></a>`,
    )
    .join("")}</nav>`;
}

/**
 * The confidence meter — the signature component.
 *
 * Five segments. Filled segments are pr-blue; the rest render as empty sockets,
 * which is the low-noise stance made visible. The threshold is drawn as a marker
 * so a gated finding shows *how far* under the bar it fell. The value is always
 * stated in text as well: confidence is never motion-only.
 */
export function confidenceMeter(confidenceBp: number, thresholdBp: number): string {
  const filled = Math.max(0, Math.min(5, Math.round((confidenceBp / 10_000) * 5)));
  const segments = Array.from({ length: 5 }, (_, i) => {
    const on = i < filled;
    const last = on && i === filled - 1;
    return `<span class="seg${on ? " on" : ""}${last ? " last" : ""}"></span>`;
  }).join("");
  const value = (confidenceBp / 10_000).toFixed(2);
  const threshold = (thresholdBp / 10_000).toFixed(2);
  const clears = confidenceBp >= thresholdBp;
  return `<span class="meter" role="img" aria-label="confidence ${esc(value)} against a threshold of ${esc(
    threshold,
  )}, ${clears ? "clears the gate" : "below the gate"}">
  <span class="meter-track">${segments}</span>
  <span class="meter-value">${esc(value)}</span>
</span>`;
}

/**
 * The tiny slice of Markdown a finding body actually uses, rendered *after*
 * escaping so nothing in it can become markup.
 *
 * Findings are written for GitHub, which renders Markdown; the dashboard has to
 * show the same text without leaving literal backticks and fences on screen.
 * Supported: fenced code blocks (into a recessed well) and inline code. Nothing
 * else — a finding body has no headings, links or images by construction.
 */
export function renderFindingBody(markdown: string): string {
  const escaped = esc(markdown);
  const parts: string[] = [];
  const fence = /```[a-z]*\n?([\s\S]*?)```/g;
  let cursor = 0;
  let m: RegExpExecArray | null;
  while ((m = fence.exec(escaped)) !== null) {
    parts.push(prose(escaped.slice(cursor, m.index)));
    parts.push(`<pre class="well"><code>${(m[1] ?? "").replace(/\n+$/, "")}</code></pre>`);
    cursor = m.index + m[0].length;
  }
  parts.push(prose(escaped.slice(cursor)));
  return parts.filter((p) => p !== "").join("\n");
}

function prose(text: string): string {
  const trimmed = text.trim();
  if (trimmed === "") return "";
  const withCode = trimmed.replace(/`([^`\n]+)`/g, "<code>$1</code>");
  return `<p class="t-sec">${withCode.replace(/\n{2,}/g, "</p><p class=\"t-sec\">")}</p>`;
}

export function categoryChip(category: string): string {
  return `<span class="chip chip-cat ${esc(category)}">${esc(category)}</span>`;
}

export function ruleChip(ruleId: string | null): string {
  return ruleId ? `<span class="chip">${esc(ruleId)}</span>` : "";
}

/** "3 minutes ago" — computed at render time, never stored. */
export function relativeTime(date: Date, now = new Date()): string {
  const seconds = Math.max(0, Math.floor((now.getTime() - date.getTime()) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`;
  const months = Math.floor(days / 30);
  return `${months} month${months === 1 ? "" : "s"} ago`;
}

export function emptyState(title: string, body: string, action?: { href: string; label: string }): string {
  return `<div class="empty">
  <p class="t-title">${esc(title)}</p>
  <p class="t-sec">${esc(body)}</p>
  ${action ? `<p class="mt-16"><a class="btn btn-secondary" href="${esc(action.href)}">${esc(action.label)}</a></p>` : ""}
</div>`;
}

/** A 12-week trend line for the noise dashboard. Pure SVG, 1.5px pr-blue. */
export function trendLine(values: number[]): string {
  if (values.length < 2) return "";
  const max = Math.max(...values, 1);
  const width = 320;
  const height = 72;
  const step = width / (values.length - 1);
  const points = values.map((v, i) => {
    const x = i * step;
    const y = height - 8 - (v / max) * (height - 16);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  return `<svg class="trend" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" role="img" aria-label="comments per pull request over the last ${values.length} weeks, latest ${values[values.length - 1]}"><path d="M${points.join(" L")}"/></svg>`;
}

export const APP_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="none" stroke="#3E7BD6" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="20" rx="4" fill="#0D1117" stroke="none"/><path d="M6 5v5a4 4 0 0 0 4 4h2"/><circle cx="6" cy="4.5" r="1.4"/><circle cx="14" cy="14" r="1.4"/></svg>`;

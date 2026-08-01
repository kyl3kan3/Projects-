/**
 * Context expansion.
 *
 * A hunk on its own is not enough to judge most defects: whether a value is
 * already validated, whether the error is handled two lines below the hunk,
 * whether the helper being called is the parameterised one. So each changed
 * file's post-image is fetched and a window around every hunk is included.
 *
 * The window is bounded, and the bound is per-review rather than per-file, because
 * the cost model in ARCHITECTURE.md is an input-token model: an unbounded
 * expansion on a 60-file PR is how a $0.06 review becomes a $2 review.
 */

import type { DiffFile } from "./parse";

export interface ContextWindowOptions {
  /** Lines of context above and below each hunk. */
  padding?: number;
  /** Hard cap on lines contributed by one file. */
  maxLinesPerFile?: number;
}

export interface NumberedSlice {
  startLine: number;
  endLine: number;
  lines: string[];
}

/**
 * Merge the hunks of a file into padded, non-overlapping post-image ranges.
 * Ranges that touch after padding are merged, so the model never sees the same
 * line twice.
 */
export function contextRanges(file: DiffFile, padding = 12): { start: number; end: number }[] {
  const ranges: { start: number; end: number }[] = [];
  for (const hunk of file.hunks) {
    const newLines = hunk.lines.filter((l) => l.newLine !== null).map((l) => l.newLine as number);
    if (newLines.length === 0) continue;
    const min = Math.min(...newLines);
    const max = Math.max(...newLines);
    ranges.push({ start: Math.max(1, min - padding), end: max + padding });
  }
  ranges.sort((a, b) => a.start - b.start);

  const merged: { start: number; end: number }[] = [];
  for (const range of ranges) {
    const last = merged[merged.length - 1];
    if (last && range.start <= last.end + 1) {
      last.end = Math.max(last.end, range.end);
    } else {
      merged.push({ ...range });
    }
  }
  return merged;
}

/**
 * Render the numbered context slices for one file.
 *
 * Line numbers are the post-image numbers, matching what the diff block shows, so
 * a model cannot confuse a context line's number with a diff line's number.
 */
export function renderContext(
  file: DiffFile,
  fileBody: string,
  options: ContextWindowOptions = {},
): string {
  const padding = options.padding ?? 12;
  const maxLines = options.maxLinesPerFile ?? 160;
  const all = fileBody.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  let used = 0;

  for (const range of contextRanges(file, padding)) {
    if (used >= maxLines) break;
    const end = Math.min(range.end, all.length);
    if (range.start > all.length) continue;
    out.push(`@@ lines ${range.start}-${end} @@`);
    for (let n = range.start; n <= end && used < maxLines; n++) {
      const text = all[n - 1];
      if (text === undefined) break;
      out.push(`${String(n).padStart(5, " ")}  ${text}`);
      used += 1;
    }
  }

  if (used >= maxLines) out.push(`... context truncated at ${maxLines} lines ...`);
  return out.join("\n");
}

/**
 * Decide which files a review actually looks at, given a line budget.
 *
 * Smallest diffs first: on a PR that mixes a 4-line logic change with a 9,000-line
 * lockfile, the logic change is the one worth the budget. Files that do not fit
 * are named in the return value so the summary comment can say so — a review that
 * silently skipped half the diff is worse than one that admits it.
 */
export function budgetFiles(
  files: DiffFile[],
  maxChangedLines: number,
): { included: DiffFile[]; skipped: string[] } {
  const reviewable = files.filter((f) => !f.patchOmitted && f.status !== "removed" && f.hunks.length > 0);
  const ordered = [...reviewable].sort(
    (a, b) => a.additions + a.deletions - (b.additions + b.deletions),
  );

  const included: DiffFile[] = [];
  const skipped: string[] = [];
  let used = 0;
  for (const file of ordered) {
    const size = file.additions + file.deletions;
    if (used + size > maxChangedLines && included.length > 0) {
      skipped.push(file.path);
      continue;
    }
    included.push(file);
    used += size;
  }

  // Restore the diff's own order: the model reads it more naturally, and the
  // fake model's finding ids become stable across runs.
  const order = new Map(files.map((f, i) => [f.path, i]));
  included.sort((a, b) => (order.get(a.path) ?? 0) - (order.get(b.path) ?? 0));
  for (const file of files) {
    if (file.patchOmitted && file.status !== "removed") skipped.push(file.path);
  }
  return { included, skipped };
}

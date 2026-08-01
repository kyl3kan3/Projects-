/**
 * Unified-diff parsing and line anchoring.
 *
 * This is the module a wrong comment comes from, so it is deliberately explicit.
 * GitHub's `GET /pulls/{n}/files` returns one `patch` per file: a unified diff
 * body with `@@` hunk headers and no `---`/`+++` preamble. We keep, for every
 * line of every hunk:
 *
 *   - `oldLine` / `newLine` — the 1-based line numbers on each side. A deletion
 *     has no `newLine`, an addition has no `oldLine`, context has both.
 *   - `position` — the 1-based offset **within the patch text**, counting the
 *     `@@` headers themselves, which is what GitHub's legacy `position`
 *     parameter means. Kept because it is the only way to comment on a line in
 *     an API version that predates `line`/`side`, and because getting it wrong
 *     by one is the classic way to land a comment on the wrong line.
 *
 * Anchoring rule, and the reason this file has so many tests: a review comment
 * may only be attached to a line GitHub considers part of the diff. Asking for
 * anything else does not "snap to the nearest line" — it 422s, or worse, lands
 * somewhere unintended. So `anchorFinding` returns null when a finding cannot be
 * placed exactly, and the caller drops the finding. No comment beats a comment
 * on the wrong line.
 */

export type LineKind = "add" | "del" | "context";
export type FileStatus =
  | "added"
  | "modified"
  | "removed"
  | "renamed"
  | "copied"
  | "changed"
  | "unchanged";

export interface DiffLine {
  kind: LineKind;
  /** 1-based line number in the pre-image, or null for an addition. */
  oldLine: number | null;
  /** 1-based line number in the post-image, or null for a deletion. */
  newLine: number | null;
  /** Line content with the +/-/space marker and any trailing CR removed. */
  content: string;
  /** True when the source line ended with CRLF. */
  crlf: boolean;
  /** 1-based offset in the patch body, counting `@@` header lines. */
  position: number;
}

export interface DiffHunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  /** The raw `@@ ... @@` line, section heading included. */
  header: string;
  /** Position of the header line itself in the patch body. */
  headerPosition: number;
  lines: DiffLine[];
}

export interface DiffFile {
  /** Path in the post-image. For a rename this is the new name. */
  path: string;
  /** Previous path when the file was renamed or copied, else null. */
  previousPath: string | null;
  status: FileStatus;
  additions: number;
  deletions: number;
  hunks: DiffHunk[];
  /** True when GitHub omitted the patch (binary, or too large). */
  patchOmitted: boolean;
}

const HUNK_RE = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/;

/**
 * Parse one file's patch body.
 *
 * Handles: CRLF line endings (stripped from content, remembered on the line),
 * `\ No newline at end of file` markers, and hunk headers with a trailing
 * section heading. Lines before the first `@@` are ignored, so passing a full
 * `diff --git` header block is harmless.
 */
export function parsePatch(patch: string): DiffHunk[] {
  const hunks: DiffHunk[] = [];
  // Split on \n and treat a trailing \r as part of the line ending, not content.
  const rawLines = patch.split("\n");
  let position = 0;
  let current: DiffHunk | null = null;
  let oldLine = 0;
  let newLine = 0;

  for (let i = 0; i < rawLines.length; i++) {
    const raw = rawLines[i] ?? "";
    // A trailing empty string from a final newline is not a diff line.
    if (i === rawLines.length - 1 && raw === "") break;

    const crlf = raw.endsWith("\r");
    const line = crlf ? raw.slice(0, -1) : raw;

    const m = HUNK_RE.exec(line);
    if (m) {
      position += 1;
      current = {
        oldStart: Number(m[1]),
        oldLines: m[2] === undefined ? 1 : Number(m[2]),
        newStart: Number(m[3]),
        newLines: m[4] === undefined ? 1 : Number(m[4]),
        header: line,
        headerPosition: position,
        lines: [],
      };
      oldLine = current.oldStart;
      newLine = current.newStart;
      hunks.push(current);
      continue;
    }

    if (!current) continue; // preamble (`diff --git`, `---`, `+++`, `index`)

    // "\ No newline at end of file" is metadata about the previous line. It
    // occupies a position in the patch but is not addressable.
    if (line.startsWith("\\")) {
      position += 1;
      continue;
    }

    const marker = line.charAt(0);
    const content = line.slice(1);
    position += 1;

    if (marker === "+") {
      current.lines.push({ kind: "add", oldLine: null, newLine, content, crlf, position });
      newLine += 1;
    } else if (marker === "-") {
      current.lines.push({ kind: "del", oldLine, newLine: null, content, crlf, position });
      oldLine += 1;
    } else if (marker === " " || line === "") {
      // An empty context line is sometimes emitted with no leading space at all.
      current.lines.push({
        kind: "context",
        oldLine,
        newLine,
        content: marker === " " ? content : "",
        crlf,
        position,
      });
      oldLine += 1;
      newLine += 1;
    } else {
      // Anything else ends the hunk (e.g. the next `diff --git` block).
      current = null;
    }
  }

  return hunks;
}

/** The shape GitHub's `GET /repos/{o}/{r}/pulls/{n}/files` returns per entry. */
export interface GithubFileEntry {
  filename: string;
  previous_filename?: string | null;
  status?: string | null;
  additions?: number | null;
  deletions?: number | null;
  patch?: string | null;
}

export function fileFromGithubEntry(entry: GithubFileEntry): DiffFile {
  const patch = entry.patch ?? "";
  return {
    path: entry.filename,
    previousPath: entry.previous_filename ?? null,
    status: normaliseStatus(entry.status),
    additions: entry.additions ?? 0,
    deletions: entry.deletions ?? 0,
    hunks: patch ? parsePatch(patch) : [],
    patchOmitted: !patch,
  };
}

function normaliseStatus(status: string | null | undefined): FileStatus {
  switch (status) {
    case "added":
    case "modified":
    case "removed":
    case "renamed":
    case "copied":
    case "changed":
    case "unchanged":
      return status;
    default:
      return "modified";
  }
}

export function parseFiles(entries: GithubFileEntry[]): DiffFile[] {
  return entries.map(fileFromGithubEntry);
}

/* --------------------------------------------------------------- queries --- */

export function changedLineCount(files: DiffFile[]): number {
  return files.reduce((n, f) => n + f.additions + f.deletions, 0);
}

/** Every line the model may be asked about, on the post-image side. */
export function addedLines(file: DiffFile): DiffLine[] {
  return file.hunks.flatMap((h) => h.lines.filter((l) => l.kind === "add"));
}

/** True when the file's patch is context only — nothing to review. */
export function isContextOnly(file: DiffFile): boolean {
  if (file.hunks.length === 0) return false;
  return file.hunks.every((h) => h.lines.every((l) => l.kind === "context"));
}

export function findFile(files: DiffFile[], path: string): DiffFile | undefined {
  return files.find((f) => f.path === path);
}

/**
 * Render the hunks of a file the way the model sees them: every reviewable line
 * prefixed with its post-image line number, so a finding can name a line that
 * actually exists. Deleted lines are shown without a number (they have none on
 * the new side) and marked, because a bug can be *caused* by a deletion.
 */
export function renderFileForModel(file: DiffFile, maxLines = 400): string {
  const out: string[] = [];
  let emitted = 0;
  for (const hunk of file.hunks) {
    out.push(hunk.header);
    for (const line of hunk.lines) {
      if (emitted >= maxLines) {
        out.push(`... truncated at ${maxLines} lines ...`);
        return out.join("\n");
      }
      const marker = line.kind === "add" ? "+" : line.kind === "del" ? "-" : " ";
      const number = line.newLine === null ? "     " : String(line.newLine).padStart(5, " ");
      out.push(`${number} ${marker}${line.content}`);
      emitted += 1;
    }
  }
  return out.join("\n");
}

/* -------------------------------------------------------------- anchoring --- */

export type AnchorSide = "RIGHT";

export interface Anchor {
  path: string;
  /** Last line of the comment range, in the post-image. */
  line: number;
  side: AnchorSide;
  /** Present only for a genuine multi-line comment; same hunk. */
  startLine?: number;
  startSide?: AnchorSide;
  /** Legacy diff position, for callers using the `position` parameter. */
  position: number;
  /** The diff lines the anchor covers — used to build suggestion blocks. */
  lines: DiffLine[];
}

export interface AnchorRequest {
  path: string;
  startLine: number;
  endLine: number;
}

/**
 * Resolve a finding's (path, startLine..endLine) to a comment anchor, or null.
 *
 * Rules, in order:
 *  1. The path must be a file in this diff, matched on the post-image name. A
 *     rename is addressed by its new name; a finding that names the old path is
 *     re-pointed to the new one rather than dropped, because models quote
 *     whichever name appears in the hunk header.
 *  2. The range must be non-empty and ordered. Reversed or zero ranges are a
 *     model error, not something to guess at.
 *  3. Only the RIGHT (post-image) side is ever used. Everything the model is
 *     shown carries a post-image line number (see `renderFileForModel`), so a
 *     line number it returns means a post-image line — and only `add` and
 *     `context` lines have one. Interpreting an unmatched number as a LEFT-side
 *     line would be exactly the wrong-line bug this module exists to prevent:
 *     old line 42 and new line 42 are usually different code.
 *  4. Every line of the requested range must live in a single hunk. GitHub
 *     rejects a multi-line comment that spans hunks, and a range that straddles
 *     one is a range the model did not really mean.
 *  5. Otherwise null: the caller drops the finding.
 */
export function anchorFinding(files: DiffFile[], req: AnchorRequest): Anchor | null {
  const file = resolveFile(files, req.path);
  if (!file || file.patchOmitted) return null;
  if (!Number.isInteger(req.startLine) || !Number.isInteger(req.endLine)) return null;
  if (req.startLine < 1 || req.endLine < req.startLine) return null;

  return anchorRight(file, req);
}

function resolveFile(files: DiffFile[], path: string): DiffFile | undefined {
  const normalised = normalisePath(path);
  const direct = files.find((f) => normalisePath(f.path) === normalised);
  if (direct) return direct;
  // A finding that quotes the pre-rename name still belongs to the new file.
  return files.find((f) => f.previousPath && normalisePath(f.previousPath) === normalised);
}

/** Strip a leading "./" or "a/"/"b/" prefix and normalise separators. */
function normalisePath(path: string): string {
  let p = path.trim().replace(/\\/g, "/");
  if (p.startsWith("./")) p = p.slice(2);
  if (p.startsWith("a/") || p.startsWith("b/")) p = p.slice(2);
  return p;
}

function anchorRight(file: DiffFile, req: AnchorRequest): Anchor | null {
  for (const hunk of file.hunks) {
    const wanted: DiffLine[] = [];
    for (const line of hunk.lines) {
      // Deletions have no post-image line number, so they are never addressable.
      if (line.newLine === null) continue;
      if (line.newLine >= req.startLine && line.newLine <= req.endLine) wanted.push(line);
    }
    if (wanted.length === 0) continue;

    // Every line of the requested range must be present in this one hunk.
    const covered = new Set(wanted.map((l) => l.newLine as number));
    for (let n = req.startLine; n <= req.endLine; n++) {
      if (!covered.has(n)) return null;
    }

    const first = wanted[0];
    const last = wanted[wanted.length - 1];
    if (!first || !last) return null;

    const anchor: Anchor = {
      path: file.path,
      line: last.newLine as number,
      side: "RIGHT",
      position: last.position,
      lines: wanted,
    };
    if (wanted.length > 1) {
      anchor.startLine = first.newLine as number;
      anchor.startSide = "RIGHT";
    }
    return anchor;
  }
  return null;
}

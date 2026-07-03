/** Server-only hashing helper (uses node:crypto — never import from a client component). */

import { createHash } from "node:crypto";

/** Deterministic cache key for a render: (project, bounds, style, aspect). */
export function renderHash(
  projectId: string,
  startMs: number,
  endMs: number,
  style: string,
  aspect: string,
): string {
  return createHash("sha1")
    .update(`${projectId}:${startMs}:${endMs}:${style}:${aspect}`)
    .digest("hex");
}

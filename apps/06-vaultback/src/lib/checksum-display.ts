/**
 * Checksum formatting, kept apart from `crypto.ts` on purpose: this is imported
 * by a client component (the checksum-lock signature detail), and `crypto.ts`
 * pulls in `node:crypto` and `node:stream`, which do not belong in a browser
 * bundle.
 */

/** Truncated checksum for display: "sha256:9f3c…a41d". */
export function shortChecksum(sha256: string): string {
  if (sha256.length <= 12) return `sha256:${sha256}`;
  return `sha256:${sha256.slice(0, 4)}…${sha256.slice(-4)}`;
}

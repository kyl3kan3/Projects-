"use client";

/**
 * The signature detail: the checksum lock.
 *
 * When a backup verifies, its checksum line scrambles — mono characters cycling
 * for 300ms — then locks in character by character, left to right, over 400ms,
 * ending with `shield-check` drawing in seal green. It is textual, mono, and
 * honest: what you watch settle is the actual hash of the object in the bucket.
 *
 * `prefers-reduced-motion` skips the scramble and renders the locked text
 * immediately, with the seal already drawn (DESIGN.md fallbacks).
 */

import { useEffect, useState } from "react";
import { IconShieldCheck } from "@/components/icons";
import { shortChecksum } from "@/lib/checksum-display";

const GLYPHS = "0123456789abcdef";
const SCRAMBLE_MS = 300;
const FRAME_MS = 50;

export function ChecksumLock({
  sha256,
  /** Only a verified snapshot animates; a pending one shows a hollow outline. */
  verified = true,
  /** Replay the scramble on mount — used right after a backup finishes. */
  animate = false,
}: {
  sha256: string | null;
  verified?: boolean;
  animate?: boolean;
}) {
  const target = sha256 ? shortChecksum(sha256) : "sha256:—";
  const [text, setText] = useState(animate && sha256 ? scramble(target) : target);
  const [locked, setLocked] = useState(!animate);

  useEffect(() => {
    if (!animate || !sha256) {
      setText(target);
      setLocked(true);
      return;
    }
    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      setText(target);
      setLocked(true);
      return;
    }

    let frame = 0;
    const frames = Math.ceil(SCRAMBLE_MS / FRAME_MS);
    const timer = setInterval(() => {
      frame++;
      if (frame >= frames) {
        clearInterval(timer);
        setText(target);
        setLocked(true);
        return;
      }
      setText(scramble(target));
    }, FRAME_MS);
    return () => clearInterval(timer);
  }, [animate, sha256, target]);

  return (
    <span className="checksum-lock" data-locked={verified && locked}>
      <span className="t-data" style={{ color: verified ? "var(--color-text-2)" : "var(--color-text-3)" }}>
        {locked && animate
          ? [...text].map((char, index) => (
              <span
                key={`${index}-${char}`}
                className="checksum-char"
                style={{ animationDelay: `${Math.min(index * 16, 400)}ms` }}
              >
                {char}
              </span>
            ))
          : text}
      </span>
      <span className="glyph" aria-hidden={false} aria-label={verified ? "Verified" : "Not verified"}>
        <IconShieldCheck size={18} draw={verified && animate} />
      </span>
    </span>
  );
}

/** Keep the "sha256:" prefix and the ellipsis; scramble only the hex. */
function scramble(target: string): string {
  return [...target]
    .map((char) => (GLYPHS.includes(char) ? GLYPHS[Math.floor(Math.random() * GLYPHS.length)] : char))
    .join("");
}

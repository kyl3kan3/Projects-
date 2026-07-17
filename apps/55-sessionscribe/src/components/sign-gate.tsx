/**
 * src/components/sign-gate.tsx
 *
 * The sign gate sheet + the four-beat sign & lock animation (DESIGN.md
 * "The signature"). Radius-20 bottom sheet on mobile, centered modal >=1024.
 *
 * TODO:
 * - [ ] Sheet content: credentials line, content preview rule, mono hash
 *       line, primary "Sign note", and the promise Label: "SIGNED NOTES ARE
 *       LOCKED. AMENDMENTS CREATE A NEW SIGNED VERSION."
 * - [ ] Beat 1: signature stroke draws left-to-right in sage (240ms,
 *       ease-out-quart).
 * - [ ] Beat 2: mono content hash fades up beneath (120ms).
 * - [ ] Beat 3: note sheet border deepens to ink; section action footers
 *       slide away (200ms) — the sheet becomes a record.
 * - [ ] Beat 4: the between-sessions clock chip flips to "signed 3:07"
 *       (spring-snappy); Today row swaps dot for lock glyph.
 * - [ ] prefers-reduced-motion: signature block appears complete with a
 *       <=100ms fade; direct chip swap; instant border.
 * - [ ] Haptic on sign (native only, never load-bearing).
 */

export type SignGateProps = {
  noteId: string;
  signerName: string;
  signerCredentials: string;
  onSigned: (result: { version: number; contentHash: string }) => void;
};

export function SignGate(_props: SignGateProps) {
  // TODO: implement per DESIGN.md "The signature — sign & lock"
  return null;
}

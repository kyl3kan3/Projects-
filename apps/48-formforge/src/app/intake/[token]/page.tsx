/**
 * src/app/intake/[token]/page.tsx
 *
 * The patient-facing packet -- FormForge's most important surface
 * (DESIGN.md "Patient packet"). Tokenized, mobile-first, save-and-
 * resume, progressive-enhancement friendly (server-rendered sections).
 *
 * TODO:
 * - [ ] Hash the token, load intake + form version; expired/invalid ->
 *       a calm dead-end page telling the patient to contact the practice
 *       (no practice data leaked).
 * - [ ] One section per screen, 17px body, progress bar + mono step
 *       counter per DESIGN.md; answers save per section (encrypted).
 * - [ ] Block renderers: demographics, insurance, history, upload
 *       (signed-URL direct to S3), screeners with instant scoring,
 *       consent + signature (typed/drawn, disclosure gate).
 * - [ ] Signature stroke replay + audit stamp (the signature detail);
 *       reduced-motion fallback per DESIGN.md.
 * - [ ] Completion screen: moss check, "You're all set -- Dr. Osei has
 *       your packet." No app upsell.
 * - [ ] Mark started/completed status transitions + audit events.
 */

export default function IntakePage() {
  return null; // TODO: implement
}

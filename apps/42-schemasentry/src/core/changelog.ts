/**
 * src/core/changelog.ts
 *
 * Changelog drafting: findings in, a human-readable consumer-facing entry
 * out (markdown), breaking changes leading with migration-note slots for
 * the human editor.
 *
 * TODO:
 * - [ ] draftEntry(diff, findings): group by endpoint, order breaking ->
 *       risky -> compatible, plain-language phrasing from reason templates.
 * - [ ] Migration-note placeholders on breaking items (editor fills them).
 * - [ ] Stable version anchors (deploy labels) for deep links.
 */

export function draftEntry(_diff: unknown, _findings: unknown[]): string {
  throw new Error("Not implemented");
}

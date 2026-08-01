/**
 * The weekly review's three questions.
 *
 * Kept apart from lib/review.ts so the client form can import them without
 * dragging the database client into the browser bundle.
 *
 * The wording matters more than it looks. "Where did you break your own rules?"
 * is deliberately not "what went wrong" — a losing trade taken correctly is not a
 * mistake, and a journal that treats it as one teaches the wrong lesson.
 */

export const REVIEW_PROMPTS = [
  {
    field: "wentWell" as const,
    label: "What did you do well?",
    hint: "Name one thing you would repeat exactly. Be specific about the setup.",
  },
  {
    field: "wentWrong" as const,
    label: "Where did you break your own rules?",
    hint: "Not the losses — the rules. A losing trade taken correctly is not a mistake.",
  },
  {
    field: "oneChange" as const,
    label: "One change for next week.",
    hint: "One. A rule you can check yourself against on Friday.",
  },
];

export type ReviewField = (typeof REVIEW_PROMPTS)[number]["field"];

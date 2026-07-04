/**
 * src/lib/claude.ts
 *
 * The Claude API client and the tool-schema-forced JSON pattern every
 * pipeline call uses. All Anthropic access goes through this module:
 * pinned model version, forced tool choice, token accounting, retries.
 *
 * TODO:
 * - [ ] Client from ANTHROPIC_API_KEY; model from ANTHROPIC_MODEL (pinned;
 *       changed only through the eval suite).
 * - [ ] forcedToolCall<T>(params): define a single tool whose input_schema
 *       is the desired output shape, call with
 *       tool_choice: { type: "tool", name }, parse the tool_use block,
 *       validate with the matching zod schema -> T. Schema-invalid output
 *       retries once with the validation error appended; then fails the
 *       job (never "best effort" parse).
 * - [ ] Prompt caching: playbook + clause-taxonomy preamble marked as
 *       cacheable (Phase 3 cost lever, wire the seam now).
 * - [ ] Token + cost accounting per call -> contracts row (COGS per review
 *       is a tracked product metric).
 * - [ ] DRY_RUN=1: fixture responses for local dev; the eval suite always
 *       hits the real API.
 */

import type { ZodType } from "zod";

export interface ForcedToolCallParams<T> {
  system: string;
  userContent: string;
  toolName: string;
  toolDescription: string;
  schema: ZodType<T>;
  maxTokens?: number;
}

export function forcedToolCall<T>(_params: ForcedToolCallParams<T>): Promise<T> {
  throw new Error("Not implemented");
}

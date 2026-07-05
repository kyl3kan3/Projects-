/**
 * Claude-powered extraction — the intelligence layer. Forces structured JSON
 * via a tool schema, validates with Zod, and repairs invalid output once
 * before failing. Prompts are tuned for sales/AM calls (MEDDICC-ish signals),
 * NOT generic meeting notes. Every proposal carries an evidence segment index
 * so the UI can link a field change back to what was actually said (README
 * differentiator #4, risk #5 mitigation: per-field provenance).
 */

import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { env } from "@/lib/env";
import type { Segment } from "@/lib/transcribe";

const ProposalSchema = z.object({
  object: z.enum(["contact", "company", "deal"]),
  property: z.string(),
  label: z.string(),
  oldValue: z.string().nullable(),
  newValue: z.string(),
  confidence: z.number().min(0).max(100),
  evidenceSegmentIdx: z.number().int().optional(),
});

const ExtractionSchema = z.object({
  overview: z.string(),
  decisions: z.array(z.object({ text: z.string(), evidenceSegmentIdx: z.number().int().optional() })),
  actionItems: z.array(
    z.object({
      text: z.string(),
      ownerName: z.string().nullable(),
      dueDate: z.string().nullable(),
      sourceSegmentIdx: z.number().int().optional(),
    }),
  ),
  risks: z.array(z.object({ text: z.string(), evidenceSegmentIdx: z.number().int().optional() })),
  nextSteps: z.string().nullable(),
  crmFieldProposals: z.array(ProposalSchema),
});

export type Extraction = z.infer<typeof ExtractionSchema>;

const TOOL = {
  name: "record_meeting_intelligence",
  description: "Record structured intelligence extracted from a sales/account-management call.",
  input_schema: {
    type: "object" as const,
    properties: {
      overview: { type: "string", description: "2-4 sentence executive summary. What happened, where the deal stands." },
      decisions: {
        type: "array",
        items: {
          type: "object",
          properties: { text: { type: "string" }, evidenceSegmentIdx: { type: "integer" } },
          required: ["text"],
        },
      },
      actionItems: {
        type: "array",
        items: {
          type: "object",
          properties: {
            text: { type: "string" },
            ownerName: { type: ["string", "null"] },
            dueDate: { type: ["string", "null"], description: "ISO date if a due date was stated or clearly implied, else null." },
            sourceSegmentIdx: { type: "integer" },
          },
          required: ["text", "ownerName", "dueDate"],
        },
      },
      risks: {
        type: "array",
        items: {
          type: "object",
          properties: { text: { type: "string" }, evidenceSegmentIdx: { type: "integer" } },
          required: ["text"],
        },
      },
      nextSteps: { type: ["string", "null"] },
      crmFieldProposals: {
        type: "array",
        description: "Concrete CRM field updates supported by the conversation. Only propose what was actually said.",
        items: {
          type: "object",
          properties: {
            object: { type: "string", enum: ["contact", "company", "deal"] },
            property: { type: "string", description: "CRM property key, e.g. dealstage, hs_next_step, closedate." },
            label: { type: "string", description: "Human label, e.g. DEAL STAGE." },
            oldValue: { type: ["string", "null"] },
            newValue: { type: "string" },
            confidence: { type: "integer" },
            evidenceSegmentIdx: { type: "integer" },
          },
          required: ["object", "property", "label", "oldValue", "newValue", "confidence"],
        },
      },
    },
    required: ["overview", "decisions", "actionItems", "risks", "nextSteps", "crmFieldProposals"],
  },
};

function transcriptText(segments: Segment[]): string {
  return segments.map((s) => `[${s.idx}] ${s.speakerLabel}: ${s.text}`).join("\n");
}

export interface DealContext {
  name: string;
  stage: string | null;
  amount: string | null;
  closeDate: string | null;
}

export async function extractInsights(opts: {
  title: string;
  segments: Segment[];
  attendees: { name: string; email: string }[];
  deal?: DealContext | null;
}): Promise<{ extraction: Extraction; usage: { input: number; output: number } }> {
  const client = new Anthropic({ apiKey: env.anthropicApiKey });

  const context = [
    `Meeting: ${opts.title}`,
    `Attendees: ${opts.attendees.map((a) => `${a.name} <${a.email}>`).join(", ") || "unknown"}`,
    opts.deal
      ? `Linked deal: ${opts.deal.name} — stage ${opts.deal.stage ?? "?"}, amount ${opts.deal.amount ?? "?"}, close ${opts.deal.closeDate ?? "?"}`
      : "No linked deal.",
    "",
    "Transcript (segment index in brackets):",
    transcriptText(opts.segments),
  ].join("\n");

  const system =
    "You are a RevOps analyst extracting deal intelligence from a sales or account-management call. " +
    "Extract only what was actually said — never invent commitments, owners, dates, or field values. " +
    "For CRM field proposals, prefer high-confidence, concrete updates (deal stage advanced, next step agreed, " +
    "close date stated, budget/authority signals). Attach an evidence segment index to every claim. " +
    "If nothing supports a field change, return an empty crmFieldProposals array. Call the tool exactly once.";

  async function run(repair?: string) {
    return client.messages.create({
      model: env.extractionModel,
      max_tokens: 2048,
      system,
      tools: [TOOL],
      tool_choice: { type: "tool", name: TOOL.name },
      messages: [{ role: "user", content: repair ? `${context}\n\n${repair}` : context }],
    });
  }

  let msg = await run();
  let block = msg.content.find((b) => b.type === "tool_use");
  let parsed = block ? ExtractionSchema.safeParse(block.input) : null;

  if (!parsed?.success) {
    msg = await run("Your previous output failed schema validation. Return valid data matching the tool schema exactly.");
    block = msg.content.find((b) => b.type === "tool_use");
    parsed = block ? ExtractionSchema.safeParse(block.input) : null;
  }
  if (!parsed?.success) throw new Error("Extraction failed schema validation after repair");

  return {
    extraction: parsed.data,
    usage: { input: msg.usage.input_tokens, output: msg.usage.output_tokens },
  };
}

/**
 * src/lib/claude.ts
 *
 * The Claude client and the one pattern every model call in this app uses: a single
 * tool whose `input_schema` *is* the desired output shape, called with
 * `tool_choice: {type: "tool", name}` so the model cannot answer in prose.
 *
 * Everything that can go wrong here is handled explicitly, because for this product
 * a confident wrong answer is the worst possible failure:
 *
 *  - schema-invalid tool input → one retry with the validation error appended, then
 *    a hard failure. There is no "best effort" parse.
 *  - a refusal, an empty response, or a stop_reason that is not `tool_use` → hard
 *    failure with the reason preserved.
 *  - timeout and transient 429/5xx → bounded retries with backoff.
 *  - token usage → returned with the result, so cost per review is a real number
 *    rather than an estimate.
 *
 * There is **no key in the build or test environment**, so `configured()` is false
 * there and callers fall back to the deterministic analyser (`src/lib/analyze.ts`).
 * The live call is therefore exercised by nothing but production; that is stated in
 * the README rather than hidden.
 */

import type { ZodType } from "zod";
import { claudeConfigured, env } from "@/lib/env";

export interface Usage {
  inputTokens: number;
  outputTokens: number;
}

export interface ForcedToolCallParams<T> {
  system: string;
  userContent: string;
  toolName: string;
  toolDescription: string;
  /** JSON Schema for the tool input — the model's output contract. */
  inputSchema: Record<string, unknown>;
  /** Zod schema that validates what came back. Mismatch is an error, not a warning. */
  schema: ZodType<T>;
  maxTokens?: number;
  /** Marks the leading system block cacheable (playbook + taxonomy preamble). */
  cacheSystem?: boolean;
}

export interface ForcedToolCallResult<T> {
  value: T;
  usage: Usage;
  modelVersion: string;
}

export class ModelError extends Error {
  constructor(
    message: string,
    readonly detail?: string,
  ) {
    super(message);
  }
}

export function configured(): boolean {
  return claudeConfigured();
}

/** Sonnet pricing per million tokens, in micro-dollars, for COGS accounting. */
const PRICE_IN_MICROS_PER_TOKEN = 3;
const PRICE_OUT_MICROS_PER_TOKEN = 15;

export function costMicros(usage: Usage): number {
  return Math.round(
    usage.inputTokens * PRICE_IN_MICROS_PER_TOKEN + usage.outputTokens * PRICE_OUT_MICROS_PER_TOKEN,
  );
}

const MAX_ATTEMPTS = 3;
const TIMEOUT_MS = 120_000;

interface AnthropicLike {
  messages: {
    create(body: Record<string, unknown>, options?: Record<string, unknown>): Promise<unknown>;
  };
}

let _client: AnthropicLike | null = null;

async function client(): Promise<AnthropicLike> {
  if (!_client) {
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    _client = new Anthropic({
      apiKey: env.anthropicApiKey,
      timeout: TIMEOUT_MS,
      maxRetries: 0, // retries are handled here, where the error text is inspected
    }) as unknown as AnthropicLike;
  }
  return _client;
}

interface ToolUseBlock {
  type: string;
  name?: string;
  input?: unknown;
  text?: string;
}

interface MessageResponse {
  content?: ToolUseBlock[];
  stop_reason?: string;
  usage?: { input_tokens?: number; output_tokens?: number };
}

function isTransient(err: unknown): boolean {
  const status = (err as { status?: number })?.status;
  if (typeof status === "number") return status === 408 || status === 429 || status >= 500;
  const name = (err as { name?: string })?.name ?? "";
  return /timeout|abort|econnreset|fetch failed/i.test(`${name} ${(err as Error)?.message ?? ""}`);
}

/**
 * Call the model and get schema-valid typed output, or throw.
 *
 * The retry loop distinguishes two failures deliberately: a transport error is
 * retried as-is, while a schema violation is retried *with the validation error in
 * the prompt*, which is the only feedback that ever fixes it.
 */
export async function forcedToolCall<T>(
  params: ForcedToolCallParams<T>,
): Promise<ForcedToolCallResult<T>> {
  if (!configured()) {
    throw new ModelError("No ANTHROPIC_API_KEY configured");
  }
  const anthropic = await client();
  const model = env.anthropicModel;
  let lastError: string | null = null;
  let usage: Usage = { inputTokens: 0, outputTokens: 0 };

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const userContent = lastError
      ? `${params.userContent}\n\nYour previous tool call was rejected by the schema validator:\n${lastError}\nCall the tool again with input that satisfies the schema exactly.`
      : params.userContent;

    let response: MessageResponse;
    try {
      response = (await anthropic.messages.create({
        model,
        max_tokens: params.maxTokens ?? 8000,
        system: params.cacheSystem
          ? [{ type: "text", text: params.system, cache_control: { type: "ephemeral" } }]
          : params.system,
        tools: [
          {
            name: params.toolName,
            description: params.toolDescription,
            input_schema: params.inputSchema,
          },
        ],
        tool_choice: { type: "tool", name: params.toolName },
        messages: [{ role: "user", content: userContent }],
      })) as MessageResponse;
    } catch (err) {
      if (isTransient(err) && attempt < MAX_ATTEMPTS) {
        await sleep(500 * 2 ** (attempt - 1));
        continue;
      }
      throw new ModelError("The model could not be reached", (err as Error)?.message);
    }

    usage = {
      inputTokens: response.usage?.input_tokens ?? 0,
      outputTokens: response.usage?.output_tokens ?? 0,
    };

    const block = response.content?.find((c) => c.type === "tool_use" && c.name === params.toolName);
    if (!block) {
      // A refusal or a plain-text answer. Never treated as a partial success.
      const text = response.content?.find((c) => c.type === "text")?.text ?? "";
      lastError = `no tool_use block (stop_reason=${response.stop_reason ?? "unknown"})`;
      if (attempt < MAX_ATTEMPTS) continue;
      throw new ModelError("The model did not return structured output", text.slice(0, 400));
    }

    const parsed = params.schema.safeParse(block.input);
    if (parsed.success) {
      return { value: parsed.data, usage, modelVersion: model };
    }
    lastError = parsed.error.issues
      .slice(0, 8)
      .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("; ");
    if (attempt >= MAX_ATTEMPTS) {
      throw new ModelError("The model's output did not match the required schema", lastError);
    }
  }

  throw new ModelError("The model's output did not match the required schema", lastError ?? undefined);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

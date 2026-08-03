/**
 * src/lib/env.ts
 *
 * Environment access. Values are read lazily through getters so that
 * `next build` — which imports modules without real secrets — never crashes on
 * a missing var. Only the code path that actually needs a secret at runtime
 * throws if it is absent.
 *
 * Two have no safe default on purpose. `AUTH_SECRET` signs the session cookie
 * that opens clinical records, and `NOTE_HASH_SECRET` is the HMAC key behind
 * every signed note's content hash — a fallback would make a signature
 * forgeable by anyone holding the source.
 *
 * The ASR and LLM keys are *optional*, and that is a product decision rather
 * than a convenience: with no key the pipeline runs its built-in fixture
 * providers, and every artifact they produce is labelled as a fixture in the UI
 * and in the database (`transcripts.provider`, `notes.model`). A demo that looks
 * like a real clinical draft would be the worst possible dishonesty here.
 */

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

function optional(name: string, fallback = ""): string {
  return process.env[name] ?? fallback;
}

export const env = {
  get databaseUrl() {
    return required("DATABASE_URL");
  },
  get authSecret() {
    return required("AUTH_SECRET");
  },
  /** HMAC key for signed-note content hashes. */
  get noteHashSecret() {
    return required("NOTE_HASH_SECRET");
  },
  get appUrl() {
    return (
      process.env.APP_URL ??
      process.env.NEXT_PUBLIC_APP_URL ??
      "http://localhost:3055"
    ).replace(/\/$/, "");
  },
  get cronSecret() {
    return optional("CRON_SECRET");
  },

  // --- Transcription (Deepgram, BAA required) ---
  get deepgramApiKey() {
    return optional("DEEPGRAM_API_KEY");
  },

  // --- Drafting LLM (Anthropic, BAA + zero-retention config required) ---
  get anthropicApiKey() {
    return optional("ANTHROPIC_API_KEY");
  },
  get draftModel() {
    return optional("DRAFT_MODEL", "claude-sonnet-5");
  },

  // --- Object storage (Cloudflare R2, S3 API) ---
  get r2() {
    return {
      accountId: optional("R2_ACCOUNT_ID"),
      accessKeyId: optional("R2_ACCESS_KEY_ID"),
      secretAccessKey: optional("R2_SECRET_ACCESS_KEY"),
      bucket: optional("R2_BUCKET"),
    };
  },

  // --- Stripe (SessionScribe's own billing; Stripe never sees PHI) ---
  get stripeSecretKey() {
    return required("STRIPE_SECRET_KEY");
  },
  get stripeWebhookSecret() {
    return required("STRIPE_WEBHOOK_SECRET");
  },
  get stripePrices() {
    return {
      solo: optional("STRIPE_PRICE_SOLO"),
      caseload: optional("STRIPE_PRICE_CASELOAD"),
      group: optional("STRIPE_PRICE_GROUP"),
    };
  },

  // --- Email (Resend; no PHI in any message, ever) ---
  get resendApiKey() {
    return optional("RESEND_API_KEY");
  },
  get emailFrom() {
    return optional("EMAIL_FROM", "SessionScribe <mail@sessionscribe.app>");
  },

  // --- Policy ---
  get retentionDefaultDays() {
    const n = Number(optional("RETENTION_DEFAULT_DAYS", "30"));
    return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 30;
  },
  /** DRY_RUN=1 logs outbound email instead of sending it. */
  get dryRun() {
    return optional("DRY_RUN", "0") === "1";
  },
} as const;

export function has(name: string): boolean {
  return Boolean(process.env[name]);
}

/** Is a real ASR provider configured? When false the fixture transcriber runs. */
export function asrConfigured(): boolean {
  return Boolean(process.env.DEEPGRAM_API_KEY);
}

/** Is a real LLM configured? When false the fixture drafter runs. */
export function llmConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

/** Is object storage configured? When false, audio stays in Postgres. */
export function storageConfigured(): boolean {
  return Boolean(
    process.env.R2_BUCKET &&
      process.env.R2_ACCOUNT_ID &&
      process.env.R2_ACCESS_KEY_ID &&
      process.env.R2_SECRET_ACCESS_KEY,
  );
}

/** Is Stripe configured? The billing screen degrades to a plan list if not. */
export function stripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

/** Is email configured (and not dry-run)? */
export function emailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY) && optional("DRY_RUN", "0") !== "1";
}

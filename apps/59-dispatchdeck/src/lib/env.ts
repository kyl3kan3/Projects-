/**
 * src/lib/env.ts
 *
 * Typed, lazy access to every environment variable in .env.example.
 * Lazy getters so `next build` succeeds without secrets and the worker
 * fails fast only when a variable is actually used.
 */

function required(name: string, hint: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable ${name} — ${hint}. See .env.example.`);
  }
  return value;
}

function optional(name: string, fallback = ""): string {
  const value = process.env[name];
  return value === undefined || value === "" ? fallback : value;
}

function bool(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const v = raw.toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

export const env = {
  get databaseUrl(): string {
    return required("DATABASE_URL", "the Postgres connection string");
  },
  /** Empty means "no Redis": enqueue() then runs the job inline. */
  get redisUrl(): string {
    return optional("REDIS_URL");
  },
  get appUrl(): string {
    return optional("APP_URL", optional("NEXT_PUBLIC_APP_URL", "http://localhost:3059"));
  },
  get sessionSecret(): string {
    return required("SESSION_SECRET", "the session cookie signing key (openssl rand -base64 32)");
  },
  get anthropicApiKey(): string {
    return optional("ANTHROPIC_API_KEY");
  },
  get r2AccountId(): string {
    return optional("R2_ACCOUNT_ID");
  },
  get r2AccessKeyId(): string {
    return optional("R2_ACCESS_KEY_ID");
  },
  get r2SecretAccessKey(): string {
    return optional("R2_SECRET_ACCESS_KEY");
  },
  get r2Bucket(): string {
    return optional("R2_BUCKET");
  },
  /** Where the local (no-R2) document driver keeps blobs. Development only. */
  get blobDir(): string {
    return optional("BLOB_DIR", ".data/blobs");
  },
  get stripeSecretKey(): string {
    return optional("STRIPE_SECRET_KEY");
  },
  get stripeWebhookSecret(): string {
    return optional("STRIPE_WEBHOOK_SECRET");
  },
  get stripePrices(): Record<"solo" | "team" | "fleet", string> {
    return {
      solo: optional("STRIPE_PRICE_SOLO"),
      team: optional("STRIPE_PRICE_TEAM"),
      fleet: optional("STRIPE_PRICE_FLEET"),
    };
  },
  get resendApiKey(): string {
    return optional("RESEND_API_KEY");
  },
  get emailFrom(): string {
    return optional("EMAIL_FROM", "DispatchDeck <office@mail.dispatchdeck.app>");
  },
  get inboundParseSecret(): string {
    return optional("INBOUND_PARSE_SECRET");
  },
  get cronSecret(): string {
    return optional("CRON_SECRET");
  },
  get sentryDsn(): string {
    return optional("SENTRY_DSN");
  },
  /** Safety switch: log outbound email instead of sending it. Defaults on. */
  get dryRun(): boolean {
    return bool("DRY_RUN", true);
  },
  /** How long one cron tick may run before deferring the rest. */
  get tickBudgetMs(): number {
    const raw = Number(optional("CRON_TICK_BUDGET_MS", "50000"));
    return Number.isFinite(raw) && raw >= 1000 ? raw : 50_000;
  },
} as const;

/** True when every named variable is present, without throwing — for feature gating. */
export function has(...names: string[]): boolean {
  return names.every((n) => Boolean(process.env[n]));
}

/**
 * Which integrations are actually wired up. Every screen that depends on one of
 * these degrades to an honest sentence rather than a broken button.
 */
export const features = {
  get r2(): boolean {
    return has("R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET");
  },
  get stripe(): boolean {
    return has("STRIPE_SECRET_KEY");
  },
  get resend(): boolean {
    return has("RESEND_API_KEY") && !env.dryRun;
  },
  get claude(): boolean {
    return has("ANTHROPIC_API_KEY");
  },
  get redis(): boolean {
    return has("REDIS_URL");
  },
  get inbound(): boolean {
    return has("INBOUND_PARSE_SECRET");
  },
};

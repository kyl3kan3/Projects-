/**
 * src/lib/env.ts
 *
 * Typed, lazy access to every environment variable in .env.example.
 * Lazy getters (not module-scope reads) so `next build` succeeds without
 * secrets and the worker fails fast only when a variable is actually used.
 */

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing required environment variable ${name}. Copy the ${name}= line from .env.example into .env.local and fill it in.`,
    );
  }
  return value;
}

function optional(name: string, fallback = ""): string {
  const value = process.env[name];
  return value === undefined || value === "" ? fallback : value;
}

function bool(name: string, fallback = false): boolean {
  const value = process.env[name];
  if (value === undefined || value === "") return fallback;
  return value === "1" || value.toLowerCase() === "true" || value.toLowerCase() === "yes";
}

export const env = {
  get databaseUrl(): string {
    return required("DATABASE_URL");
  },
  /** Empty when no queue is configured — see lib/runtime.ts `hasQueue()`. */
  get redisUrl(): string {
    return optional("REDIS_URL");
  },
  get appUrl(): string {
    return optional("APP_URL", optional("NEXT_PUBLIC_APP_URL", "http://localhost:3054"));
  },
  get authSecret(): string {
    return required("AUTH_SECRET");
  },
  /** Falls back to AUTH_SECRET so a single-secret dev setup still works. */
  get icsTokenSecret(): string {
    return optional("ICS_TOKEN_SECRET") || required("AUTH_SECRET");
  },
  /** Optional: without it the SAM connector runs off its bundled fixture. */
  get samGovApiKey(): string {
    return optional("SAM_GOV_API_KEY");
  },
  get ingestUserAgent(): string {
    return optional("INGEST_USER_AGENT", "RFPRadarBot/1.0 (+https://rfpradar.io/bot)");
  },
  get stripeSecretKey(): string {
    return required("STRIPE_SECRET_KEY");
  },
  get stripeWebhookSecret(): string {
    return required("STRIPE_WEBHOOK_SECRET");
  },
  get stripePrices(): { scout: string; pursuit: string; capture: string } {
    return {
      scout: optional("STRIPE_PRICE_SCOUT"),
      pursuit: optional("STRIPE_PRICE_PURSUIT"),
      capture: optional("STRIPE_PRICE_CAPTURE"),
    };
  },
  get resendApiKey(): string {
    return optional("RESEND_API_KEY");
  },
  get emailFrom(): string {
    return optional("EMAIL_FROM", "RFPRadar <scan@mail.rfpradar.io>");
  },
  get sentryDsn(): string {
    return optional("SENTRY_DSN");
  },
  /**
   * Suppresses outbound email/Slack and logs instead. Defaults to true when
   * no Resend key exists, so a half-configured environment never silently
   * pretends it delivered a morning scan.
   */
  get dryRun(): boolean {
    return bool("DRY_RUN", !process.env.RESEND_API_KEY);
  },
} as const;

/** True when a variable is present, without throwing — for feature gating. */
export function has(name: string): boolean {
  return Boolean(process.env[name]);
}

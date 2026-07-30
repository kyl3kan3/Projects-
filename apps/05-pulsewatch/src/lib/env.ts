/**
 * Environment access.
 *
 * Values are read lazily through getters so that `next build` (which imports
 * modules without real secrets) never crashes on a missing var — only the code
 * path that actually needs a secret at runtime will throw if it's absent.
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
  get redisUrl() {
    return required("REDIS_URL");
  },
  get authSecret() {
    return required("AUTH_SECRET");
  },
  get appUrl() {
    return optional("NEXT_PUBLIC_APP_URL", "http://localhost:3000");
  },
  /**
   * Public base for heartbeat ping URLs. Kept separate from appUrl because the
   * ingest path is meant to live on its own hostname (ARCHITECTURE.md), so a
   * dashboard outage can never stop pings from being accepted.
   */
  get pingBaseUrl() {
    return optional("NEXT_PUBLIC_PING_BASE_URL", optional("NEXT_PUBLIC_APP_URL", "http://localhost:3000"));
  },
  /** Public base for status pages; the slug is appended as /status/{slug}. */
  get statusBaseUrl() {
    return optional("NEXT_PUBLIC_STATUS_BASE_URL", optional("NEXT_PUBLIC_APP_URL", "http://localhost:3000"));
  },

  // --- probe fleet ---
  /** Region this probe process reports as. Set per Fly machine. */
  get probeRegion() {
    return optional("PROBE_REGION", "iad");
  },
  /** Regions the scheduler fans checks out to. */
  get probeRegions(): string[] {
    return optional("PROBE_REGIONS", "iad")
      .split(",")
      .map((r) => r.trim())
      .filter(Boolean);
  },

  // --- Stripe ---
  get stripeSecretKey() {
    return required("STRIPE_SECRET_KEY");
  },
  get stripeWebhookSecret() {
    return required("STRIPE_WEBHOOK_SECRET");
  },
  get stripePrices() {
    return {
      solo: optional("STRIPE_PRICE_SOLO"),
      team: optional("STRIPE_PRICE_TEAM"),
    };
  },

  // --- Resend ---
  get resendApiKey() {
    return optional("RESEND_API_KEY");
  },
  get emailFrom() {
    return optional("EMAIL_FROM", "PulseWatch <alerts@pulsewatch.dev>");
  },
} as const;

/** True when a var is present without throwing — for feature gating. */
export function has(name: string): boolean {
  return Boolean(process.env[name]);
}

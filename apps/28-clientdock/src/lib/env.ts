/**
 * Environment access.
 *
 * Values are read lazily through getters so `next build` (which imports modules
 * without real secrets) never crashes on a missing var — only the code path that
 * actually needs a secret at runtime throws if it is absent.
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
  get appUrl() {
    return optional("NEXT_PUBLIC_APP_URL", "http://localhost:3028");
  },

  /* --- file storage ------------------------------------------------------ */
  /**
   * "db" keeps blobs in Postgres (`file_blobs`) — the only driver that works on
   * Vercel, whose filesystem is read-only. "local" writes under STORAGE_DIR and
   * is nicer for development. An S3/R2 driver drops in behind the same interface
   * (src/lib/storage.ts) without touching a caller.
   */
  get storageDriver(): "db" | "local" {
    return optional("STORAGE_DRIVER", "db") === "local" ? "local" : "db";
  },
  get storageDir() {
    return optional("STORAGE_DIR", ".data/uploads");
  },
  get maxUploadBytes() {
    const n = Number(optional("MAX_UPLOAD_BYTES", ""));
    return Number.isFinite(n) && n > 0 ? n : 10 * 1024 * 1024;
  },

  /* --- Stripe (our subscription billing) --------------------------------- */
  get stripeSecretKey() {
    return required("STRIPE_SECRET_KEY");
  },
  get stripeWebhookSecret() {
    return required("STRIPE_WEBHOOK_SECRET");
  },
  get stripePrices() {
    return {
      solo: optional("STRIPE_PRICE_SOLO"),
      agency: optional("STRIPE_PRICE_AGENCY"),
      studio: optional("STRIPE_PRICE_STUDIO"),
    };
  },

  /* --- email ------------------------------------------------------------- */
  get resendApiKey() {
    return optional("RESEND_API_KEY");
  },
  /** Fallback sender, used until an agency's own domain verifies. */
  get emailFrom() {
    return optional("EMAIL_FROM", "ClientDock <portals@clientdock.app>");
  },
  /** Domain that carries per-thread reply addresses for inbound parsing. */
  get inboundDomain() {
    return optional("INBOUND_EMAIL_DOMAIN", "reply.clientdock.app");
  },
  get inboundSecret() {
    return optional("INBOUND_WEBHOOK_SECRET");
  },

  /* --- scheduled work --------------------------------------------------- */
  get cronSecret() {
    return optional("CRON_SECRET");
  },
} as const;

/** True when a var is present, without throwing — for feature gating. */
export function has(name: string): boolean {
  return Boolean(process.env[name]);
}

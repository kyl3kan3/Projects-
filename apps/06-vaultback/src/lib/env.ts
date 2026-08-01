/**
 * Environment access.
 *
 * Values are read lazily through getters so `next build` — which imports every
 * module without real secrets — never crashes on a missing var. Only the code
 * path that actually needs a secret throws, and only when it runs.
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
    return optional("NEXT_PUBLIC_APP_URL", "http://localhost:3006");
  },

  // --- encryption ---
  /**
   * Wraps per-snapshot data keys (envelope encryption). 32-byte hex.
   * Stands in for the KMS master key in ARCHITECTURE.md: the wrap/unwrap seam
   * is identical, so moving to KMS later replaces two functions in crypto.ts.
   */
  get backupMasterKey() {
    return required("BACKUP_MASTER_KEY");
  },
  /**
   * Encrypts customer connection strings at rest. Deliberately a *different*
   * key from the snapshot master key: compromising one must not decrypt the
   * other (ARCHITECTURE.md risk 3).
   */
  get credentialsKey() {
    return required("CREDENTIALS_KEY");
  },

  // --- managed storage (the default target for every org) ---
  get s3(): {
    endpoint: string;
    region: string;
    bucket: string;
    accessKeyId: string;
    secretAccessKey: string;
  } {
    return {
      endpoint: optional("S3_ENDPOINT"),
      region: optional("S3_REGION", "auto"),
      bucket: optional("S3_BUCKET"),
      accessKeyId: optional("S3_ACCESS_KEY_ID"),
      secretAccessKey: optional("S3_SECRET_ACCESS_KEY"),
    };
  },
  /**
   * Development escape hatch: with no managed bucket configured, snapshots are
   * written to this directory instead. Still gzipped and still AES-256-GCM
   * encrypted — only the transport differs. Refused on Vercel (see storage.ts).
   */
  get localStorageDir() {
    return optional("LOCAL_STORAGE_DIR", ".vaultback-storage");
  },

  /**
   * Postgres instance drills restore into. A scratch database is created on it
   * per drill and dropped afterwards, so this must be a server VaultBack owns —
   * never a customer's. Falls back to our own control-plane server in dev.
   */
  get scratchAdminUrl() {
    return optional("SCRATCH_POSTGRES_URL", optional("DATABASE_URL"));
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
      hobby: optional("STRIPE_PRICE_HOBBY"),
      startup: optional("STRIPE_PRICE_STARTUP"),
      business: optional("STRIPE_PRICE_BUSINESS"),
    };
  },

  // --- Resend ---
  get resendApiKey() {
    return optional("RESEND_API_KEY");
  },
  get emailFrom() {
    return optional("EMAIL_FROM", "VaultBack <alerts@vaultback.dev>");
  },
} as const;

/** True when a var is present, without throwing — for feature gating in the UI. */
export function has(name: string): boolean {
  return Boolean(process.env[name]);
}

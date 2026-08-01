/**
 * Environment access.
 *
 * Values are read lazily through getters so `next build` — which imports every
 * module without real secrets — never crashes on a missing var. Only the code
 * path that actually needs a secret at runtime throws if it is absent.
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
    return optional("NEXT_PUBLIC_APP_URL", "http://localhost:3000").replace(/\/$/, "");
  },
  /** Public base the embed script is served from. */
  get widgetCdnUrl() {
    const configured = optional("NEXT_PUBLIC_WIDGET_CDN_URL");
    return (configured || `${this.appUrl}/widget`).replace(/\/$/, "");
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
      starter: optional("STRIPE_PRICE_STARTER"),
      growth: optional("STRIPE_PRICE_GROWTH"),
      pro: optional("STRIPE_PRICE_PRO"),
    };
  },

  // --- Shopify ---
  get shopifyApiKey() {
    return required("SHOPIFY_API_KEY");
  },
  get shopifyApiSecret() {
    return required("SHOPIFY_API_SECRET");
  },
  get shopifyScopes() {
    return optional("SHOPIFY_SCOPES", "read_orders,read_fulfillments,write_script_tags");
  },

  // --- Resend ---
  get resendApiKey() {
    return required("RESEND_API_KEY");
  },
  get emailFrom() {
    return optional("EMAIL_FROM", "TrustBadge <reviews@trustbadge.io>");
  },

  // --- Media ---
  get s3() {
    return {
      endpoint: optional("S3_ENDPOINT"),
      region: optional("S3_REGION", "auto"),
      accessKeyId: optional("S3_ACCESS_KEY_ID"),
      secretAccessKey: optional("S3_SECRET_ACCESS_KEY"),
      bucket: optional("S3_BUCKET"),
      publicUrl: optional("S3_PUBLIC_URL").replace(/\/$/, ""),
    };
  },
} as const;

/** True when a var is present, without throwing — for feature gating. */
export function has(name: string): boolean {
  return Boolean(process.env[name]);
}

/** Object storage is only usable when every piece of it is configured. */
export function objectStorageConfigured(): boolean {
  const s3 = env.s3;
  return Boolean(s3.endpoint && s3.accessKeyId && s3.secretAccessKey && s3.bucket && s3.publicUrl);
}

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
  /** Signs the session cookie and derives the at-rest key for Shopify tokens. */
  get authSecret() {
    return required("AUTH_SECRET");
  },
  get appUrl() {
    return optional("APP_URL", optional("NEXT_PUBLIC_APP_URL", "http://localhost:3047")).replace(
      /\/$/,
      "",
    );
  },

  // --- Shopify (Partner app) ---
  get shopifyApiKey() {
    return required("SHOPIFY_API_KEY");
  },
  get shopifyApiSecret() {
    return required("SHOPIFY_API_SECRET");
  },
  get shopifyScopes() {
    return optional("SHOPIFY_SCOPES", "read_products,read_inventory,read_orders");
  },
  get shopifyRedirectPath() {
    return optional("SHOPIFY_REDIRECT_PATH", "/api/shopify/callback");
  },

  // --- Resend ---
  get resendApiKey() {
    return optional("RESEND_API_KEY");
  },
  get emailFrom() {
    return optional("EMAIL_FROM", "ShelfSense <orders@mail.shelfsense.dev>");
  },

  /**
   * Safety switch. With DRY_RUN=1 nothing is actually emailed — digests and PO
   * sends are recorded and logged instead, which is also what happens with no
   * RESEND_API_KEY configured.
   */
  get dryRun() {
    return optional("DRY_RUN", "") === "1";
  },
} as const;

/** True when a var is present, without throwing — for feature gating. */
export function has(name: string): boolean {
  return Boolean(process.env[name]);
}

/** Shopify install is only offered when the app is actually registered. */
export function shopifyConfigured(): boolean {
  return has("SHOPIFY_API_KEY") && has("SHOPIFY_API_SECRET");
}

/** Outbound email is only possible with a key and DRY_RUN off. */
export function emailConfigured(): boolean {
  return has("RESEND_API_KEY") && !env.dryRun;
}

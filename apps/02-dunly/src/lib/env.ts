/**
 * Typed environment access. Server-only values throw when read at runtime
 * without being set; build-time evaluation stays lazy so `next build`
 * succeeds without a full env.
 */

function req(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

export const env = {
  get databaseUrl() { return req("DATABASE_URL"); },
  get redisUrl() { return req("REDIS_URL"); },
  get appUrl() { return process.env.APP_URL ?? "http://localhost:3000"; },
  get authSecret() { return req("AUTH_SECRET"); },

  // Stripe platform (Connect + our own billing)
  get stripeSecretKey() { return req("STRIPE_SECRET_KEY"); },
  get stripeWebhookSecret() { return req("STRIPE_WEBHOOK_SECRET"); },
  get stripeBillingWebhookSecret() {
    return process.env.STRIPE_BILLING_WEBHOOK_SECRET ?? req("STRIPE_WEBHOOK_SECRET");
  },
  get stripeConnectClientId() { return req("STRIPE_CONNECT_CLIENT_ID"); },

  // Card-update link signing
  get cardTokenSecret() { return process.env.CARD_TOKEN_SECRET ?? req("AUTH_SECRET"); },

  // Email
  get resendApiKey() { return req("RESEND_API_KEY"); },
  get emailFrom() { return process.env.EMAIL_FROM ?? "recover@dunly.app"; },

  get dryRun() { return process.env.DRY_RUN === "1"; },
};

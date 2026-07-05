/** Typed environment access; server-only values throw lazily at read time. */

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
  get tokenEncryptionKey() { return process.env.TOKEN_ENCRYPTION_KEY ?? req("AUTH_SECRET"); },

  get recallApiKey() { return req("RECALL_API_KEY"); },
  get recallWebhookSecret() { return process.env.RECALL_WEBHOOK_SECRET ?? ""; },
  get deepgramApiKey() { return req("DEEPGRAM_API_KEY"); },
  get anthropicApiKey() { return req("ANTHROPIC_API_KEY"); },

  get hubspotClientId() { return req("HUBSPOT_CLIENT_ID"); },
  get hubspotClientSecret() { return req("HUBSPOT_CLIENT_SECRET"); },

  get slackClientId() { return process.env.SLACK_CLIENT_ID ?? ""; },
  get slackSigningSecret() { return process.env.SLACK_SIGNING_SECRET ?? ""; },

  get stripeSecretKey() { return req("STRIPE_SECRET_KEY"); },
  get stripeWebhookSecret() { return req("STRIPE_WEBHOOK_SECRET"); },
  get stripePriceStarter() { return process.env.STRIPE_PRICE_STARTER ?? ""; },
  get stripePricePro() { return process.env.STRIPE_PRICE_PRO ?? ""; },
  get stripePriceBusiness() { return process.env.STRIPE_PRICE_BUSINESS ?? ""; },

  get resendApiKey() { return req("RESEND_API_KEY"); },
  get emailFrom() { return process.env.EMAIL_FROM ?? "Briefcast <briefs@briefcast.app>"; },

  get extractionModel() { return process.env.EXTRACTION_MODEL ?? "claude-sonnet-5"; },
  get dryRun() { return process.env.DRY_RUN === "1"; },
};

/**
 * Environment access.
 *
 * Every value is read through a getter so `next build` — which imports modules
 * with no real secrets present — never crashes on a missing var. Only the code
 * path that actually needs a secret throws, and it names the variable.
 */

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
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
    return optional("APP_URL", optional("NEXT_PUBLIC_APP_URL", "http://localhost:3030"));
  },

  // --- AWS: the credential CloudSpend itself uses to sts:AssumeRole into a
  //     customer account. With none of these set the synthetic provider is
  //     selected instead and connected accounts are labelled as demo data.
  get aws() {
    return {
      region: optional("AWS_REGION", "us-east-1"),
      accessKeyId: optional("AWS_ACCESS_KEY_ID"),
      secretAccessKey: optional("AWS_SECRET_ACCESS_KEY"),
      /** The account id that appears in the CloudFormation trust policy. */
      platformAccountId: optional("CLOUDSPEND_AWS_ACCOUNT_ID", "000000000000"),
      /** S3 URL of the published CloudFormation template. */
      templateUrl: optional(
        "CLOUDSPEND_CFN_TEMPLATE_URL",
        "https://cloudspend-public.s3.amazonaws.com/cloudspend-readonly-role.yml",
      ),
    };
  },
  /**
   * True when CloudSpend can actually talk to a customer's AWS account.
   *
   * All three are required, not just the credential: without
   * `CLOUDSPEND_AWS_ACCOUNT_ID` the CloudFormation trust policy has no principal
   * to name, so the quick-create link cannot produce a role we are allowed to
   * assume. Treating a half-configured deployment as "AWS ready" is how you get
   * an onboarding flow that says "connected" and then never ingests anything.
   *
   * When this is false the synthetic provider is used and every screen fed by it
   * is labelled as demo data.
   */
  get awsConfigured() {
    return Boolean(
      process.env.AWS_ACCESS_KEY_ID &&
        process.env.AWS_SECRET_ACCESS_KEY &&
        process.env.CLOUDSPEND_AWS_ACCOUNT_ID,
    );
  },

  // --- Slack ---
  get slack() {
    return {
      clientId: optional("SLACK_CLIENT_ID"),
      clientSecret: optional("SLACK_CLIENT_SECRET"),
      signingSecret: optional("SLACK_SIGNING_SECRET"),
    };
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
      startup: optional("STRIPE_PRICE_STARTUP"),
      scale: optional("STRIPE_PRICE_SCALE"),
    };
  },

  // --- email fallback for alerts when Slack isn't connected ---
  get resendApiKey() {
    return optional("RESEND_API_KEY");
  },
  get emailFrom() {
    return optional("EMAIL_FROM", "CloudSpend <alerts@cloudspend.dev>");
  },

  get cronSecret() {
    return optional("CRON_SECRET");
  },
} as const;

/** True when a var is present, without throwing — for feature gating. */
export function has(name: string): boolean {
  return Boolean(process.env[name]);
}

/**
 * Environment access.
 *
 * Every value is read through a getter, so importing this module never throws
 * for a variable the current process does not need. Only the code path that
 * actually requires a secret fails, and it fails with the variable's name.
 */

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

function optional(name: string, fallback = ""): string {
  const v = process.env[name];
  return v === undefined || v === "" ? fallback : v;
}

function num(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export const env = {
  get databaseUrl() {
    return required("DATABASE_URL");
  },
  /** Empty string means "no Redis": the webhook handler reviews inline instead. */
  get redisUrl() {
    return optional("REDIS_URL");
  },
  get port() {
    return num("PORT", 3007);
  },
  get dashboardUrl() {
    return optional("DASHBOARD_URL", `http://localhost:${env.port}`);
  },
  get sessionSecret() {
    return required("AUTH_SECRET");
  },
  get logLevel() {
    return optional("LOG_LEVEL", "info");
  },

  // --- model ---
  get anthropicApiKey() {
    return optional("ANTHROPIC_API_KEY");
  },
  get reviewModel() {
    return optional("REVIEW_MODEL", "claude-sonnet-5");
  },
  get confidenceModel() {
    return optional("CONFIDENCE_MODEL", optional("REVIEW_MODEL", "claude-sonnet-5"));
  },
  /** Hard ceiling on a single analysis call, in ms. */
  get modelTimeoutMs() {
    return num("MODEL_TIMEOUT_MS", 120_000);
  },

  // --- review defaults (a rulebook may tighten these, never loosen past the floor) ---
  get confidenceThreshold() {
    return num("CONFIDENCE_POST_THRESHOLD", 0.8);
  },
  get maxCommentsPerPr() {
    return num("MAX_COMMENTS_PER_PR", 10);
  },
  get maxReviewConcurrency() {
    return num("MAX_REVIEW_CONCURRENCY", 4);
  },
  /** Diffs above this many changed lines are reviewed partially, never silently. */
  get maxDiffLines() {
    return num("MAX_DIFF_LINES", 3_000);
  },

  // --- billing ---
  get marketplacePlanIds() {
    return {
      team: optional("MARKETPLACE_PLAN_ID_TEAM"),
      business: optional("MARKETPLACE_PLAN_ID_BUSINESS"),
    };
  },

  // --- dashboard auth ---
  get githubClientId() {
    return optional("GITHUB_CLIENT_ID");
  },
  get githubClientSecret() {
    return optional("GITHUB_CLIENT_SECRET");
  },
  /**
   * Local-only escape hatch: sign in to the dashboard as an arbitrary login
   * without a GitHub OAuth round trip. Refused outright when NODE_ENV is
   * production, whatever the flag says.
   */
  get devLoginEnabled() {
    return process.env.NODE_ENV !== "production" && optional("MERGEMATE_DEV_LOGIN") === "1";
  },
} as const;

export function has(name: string): boolean {
  return Boolean(process.env[name]);
}

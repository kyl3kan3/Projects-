/**
 * The one error class whose message is safe to render.
 *
 * Everything else — a Postgres constraint name, a Stripe internal message — is
 * replaced by the caller's fallback copy. A raw driver error in a form is useless
 * to an operations lead and a small information leak besides.
 */

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

export function safeMessage(err: unknown, fallback: string): string {
  if (err instanceof ValidationError) return err.message;
  return fallback;
}

/**
 * `redirect()` inside a server action throws a control-flow error that must not be
 * swallowed by a catch-all. Re-throw it.
 */
export function isRedirectError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "digest" in err &&
    typeof (err as { digest?: unknown }).digest === "string" &&
    (err as { digest: string }).digest.startsWith("NEXT_REDIRECT")
  );
}

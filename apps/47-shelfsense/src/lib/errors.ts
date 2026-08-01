/**
 * Domain error types.
 *
 * Server actions catch these by class and show the message to the merchant;
 * anything else is logged and replaced with a generic line, so an internal error
 * can never leak a stack trace or a query into the UI.
 */

/** The input was wrong, and the message is safe to show the person who typed it. */
export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

/** The action is fine, the plan does not allow it. Carries the upsell target. */
export class PlanLimitError extends Error {
  readonly requiredPlan: string | null;

  constructor(message: string, requiredPlan: string | null = null) {
    super(message);
    this.name = "PlanLimitError";
    this.requiredPlan = requiredPlan;
  }
}

/** The caller asked for something that is not theirs, or is not there. */
export class NotFoundError extends Error {
  constructor(message = "Not found") {
    super(message);
    this.name = "NotFoundError";
  }
}

/** Turn any thrown thing into a message that is safe to render. */
export function safeMessage(err: unknown, fallback = "Something went wrong."): string {
  if (
    err instanceof ValidationError ||
    err instanceof PlanLimitError ||
    err instanceof NotFoundError
  ) {
    return err.message;
  }
  console.error("[shelfsense] unexpected error", err);
  return fallback;
}

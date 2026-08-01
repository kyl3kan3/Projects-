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
  readonly requiredTier: string | null;

  constructor(message: string, requiredTier: string | null = null) {
    super(message);
    this.name = "PlanLimitError";
    this.requiredTier = requiredTier;
  }
}

/** The caller asked for something that is not theirs, or is not there. */
export class NotFoundError extends Error {
  constructor(message = "Not found") {
    super(message);
    this.name = "NotFoundError";
  }
}

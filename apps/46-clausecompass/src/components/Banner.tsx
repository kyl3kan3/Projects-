/**
 * The not-legal-advice banner.
 *
 * DESIGN.md: "every report page and screen footer … never mumbled, never dismissible."
 * It takes no props for exactly that reason — there is no variant of this component that
 * says something softer, and nothing can hide it.
 */

export const BANNER_LINE = "Not legal advice — ClauseCompass is a reading tool, not a law firm.";

export function Banner() {
  return (
    <p className="banner" role="note">
      {BANNER_LINE}
    </p>
  );
}

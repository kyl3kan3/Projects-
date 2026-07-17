/**
 * PolicyPanel — the agreement moment on the booking page.
 *
 * Renders the stylist's current policy text VERBATIM in a quiet framed
 * block above the confirm button; the button label carries the
 * agreement ("Book and agree to the policy"). No checkbox theater — the
 * tap is the agreement, and the stamp (version + timestamp) is what
 * wins disputes.
 *
 * TODO:
 * - [ ] Props: policyText, policyVersion; renders hairline-framed panel
 *       per DESIGN.md (paper ground, ink text, no accent).
 * - [ ] Deposit line when the service has one ("$20 deposit today,
 *       applied to your service").
 */

export interface PolicyPanelProps {
  policyText: string;
  policyVersion: number;
  depositCents: number;
}

export function PolicyPanel(props: PolicyPanelProps) {
  void props;
  return <div className="policy-panel">Not implemented</div>;
}

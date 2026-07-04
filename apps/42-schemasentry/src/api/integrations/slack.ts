/**
 * src/api/integrations/slack.ts
 *
 * Slack app integration: workspace install (OAuth), channel config per API,
 * and the Block Kit alert mirrored pixel-for-pixel by the in-app design
 * (DESIGN.md "Slack alert" spec — no emoji, verdicts as text).
 *
 * TODO:
 * - [ ] OAuth install flow + token storage per org.
 * - [ ] postDiffAlert(diff): header, verdict/deploy fields, top findings
 *       with mono pointers, View diff + Acknowledge actions.
 * - [ ] Ack action handler: signature verification, hold-note modal,
 *       message updated in place ("Acked by dana — intentional removal").
 */

export {};

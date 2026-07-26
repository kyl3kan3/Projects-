// Onboarding flow — state picker (50 states + DC), stage picker (considering /
// separating / filed / post-decree), minor-children y/n, then MANDATORY app-lock
// setup, then the first checklist section. Ends at the paywall only after first
// value (a completed section or a sealed entry). Shows the "informational only,
// not legal or financial advice" disclosure.
//
// TODO:
// - [ ] Step screens with progress; answers persisted to settings via repositories
// - [ ] State picker drives state-aware checklist branches (src/data/states.ts)
// - [ ] Stage = post_decree activates the rebuild plan immediately
// - [ ] Lock setup step calls src/lib/applock.ts enrollment; cannot be skipped
// - [ ] Non-advice disclosure screen with acknowledgement
// - [ ] Route to (tabs) home; paywall presented at first gate touchpoint, not here
export {};

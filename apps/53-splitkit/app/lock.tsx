// Lock screen — the app-lock gate. Bone/charcoal ground, lock glyph, Face ID
// prompt with PIN fallback. No user data is ever visible on or behind this
// screen. Mandatory: onboarding configures the lock before first data entry.
//
// TODO:
// - [ ] Trigger expo-local-authentication on mount; PIN fallback UI per DESIGN.md
// - [ ] On success: replace-route back to the last requested destination
// - [ ] Failure/lockout states with plain-language copy (registrar voice, no panic)
// - [ ] Block screenshots/app-switcher preview of data screens where the platform allows
export {};

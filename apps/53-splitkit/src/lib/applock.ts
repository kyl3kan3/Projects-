// App-lock module — mandatory biometric/PIN gate (expo-local-authentication).
// Enrolled during onboarding BEFORE any data entry; locks on cold start and on
// return from background. Privacy from one specific person is the product's
// threat model — treat every bypass as a security bug.
//
// TODO:
// - [ ] enroll(): verify device biometrics/PIN availability; set lock_configured in settings
// - [ ] authenticate(): biometric prompt with PIN fallback; typed results for the lock screen
// - [ ] AppState listener: mark locked on background; root layout routes to /lock
// - [ ] Lockout/backoff handling copy states (registrar voice)
// - [ ] Ensure no data screen can mount pre-auth (navigation guard, tested in Week-1 spike)
export {};

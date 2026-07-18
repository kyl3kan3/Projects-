// Local notifications — deadline and gathering reminders. LOCK-SCREEN CONTENT
// IS ALWAYS GENERIC ("SplitKit reminder") — never task titles, never names,
// never anything that reveals what the app is being used for. No server, no
// push tokens.
//
// TODO:
// - [ ] Permission request flow (deferred until the user creates a reminder)
// - [ ] schedule/cancel mirrored to reminderRepo rows
// - [ ] Generic-content rule enforced at the single scheduling call site
// - [ ] Rebuild-plan due-date scheduling; delivered flag sync on app open
// - [ ] Verify on device: nothing sensitive on the lock screen (Phase-1 acceptance)
export {};

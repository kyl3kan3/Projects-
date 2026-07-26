// Repository layer — all SQL lives here; screens never touch the db directly.
// TODO: families/members, tasks (needs-an-owner query, recur expansion, done flow),
// expenses + balances (equal split minus settlements — verify against hand ledgers),
// documents, contacts, entries, reminders, todayView() and digest aggregates;
// every write marks sync_state for the sync engine.
export {};

// Court-ready export sheet (paid) — date-range chips, entry count, chain
// verification status, plain-language method note, then "Export court-ready
// PDF". Runs verifyChain() first; a broken chain blocks export with an
// explanation. Renders on device via expo-print → system share sheet.
// NEVER uses the word "admissible" anywhere on this screen or in the PDF.
//
// TODO:
// - [ ] Date-range chips (all / 90 days / custom) + entry count preview
// - [ ] verifyChain() gate with verified badge / break explanation (verdigris / ink — never oxblood)
// - [ ] Build HTML via src/lib/exportPdf.ts; expo-print → expo-sharing
// - [ ] Paywall gate on entry to this screen for free tier
// - [ ] Loading/progress state for large logs; failure retry
export {};

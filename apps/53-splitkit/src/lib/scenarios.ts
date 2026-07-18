// Scenario arithmetic — pure functions only, no persistence of outputs, no
// thresholds, no recommendations. Every rendered output block carries the
// attorney/CDFA footer verbatim (the UI enforces it; the copy lives here as a
// single exported constant so it cannot drift).
//
// Worksheets (typed inputs_json shapes per kind):
//   house:   equity = value − mortgage; buyout = equity × share ± adjustments;
//            monthly carrying cost (PITI + upkeep inputs); months-to-break-even
//   pension: marital fraction = years-of-service-during-marriage ÷ total service;
//            marital portion = benefit × fraction; user-entered split share
//   cashflow: monthly income lines − monthly expense lines = net (signed)
//
// TODO:
// - [ ] Typed input interfaces per kind + parse/validate of inputs_json
// - [ ] computeHouse / computePension / computeCashflow pure functions (integer cents)
// - [ ] export const ADVICE_FOOTER = "Arithmetic on your numbers — not a valuation, not advice. Bring it to your attorney or a CDFA."
// - [ ] Unit tests with worked examples; rounding rules documented in-code
// - [ ] NEVER add language that characterizes property or recommends an option
export {};

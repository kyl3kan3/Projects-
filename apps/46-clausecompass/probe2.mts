import { parseText } from "./src/lib/parse.js";
import { analyzeContract } from "./src/lib/analyze.js";
import { extractLocally } from "./src/lib/extract.js";
import { FIXTURES } from "./src/fixtures/contracts.js";
for (const f of FIXTURES) {
  let t = Date.now();
  const parsed = parseText(f.text);
  console.log(f.key, "parse", Date.now()-t, "ms");
  t = Date.now();
  analyzeContract(parsed);
  console.log(f.key, "analyze", Date.now()-t, "ms");
  t = Date.now();
  const r = extractLocally(parsed);
  console.log(f.key, "extract", Date.now()-t, "ms", "clauses", r.clauses.length, JSON.stringify(r.coverage.map(c=>c.disposition)));
}

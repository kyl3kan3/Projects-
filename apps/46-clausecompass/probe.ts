import { parseText } from "@/lib/parse";
import { analyzeContract } from "@/lib/analyze";
import { FIXTURES } from "@/fixtures/contracts";

for (const f of FIXTURES) {
  const parsed = parseText(f.text);
  const a = analyzeContract(parsed);
  console.log("====", f.key, "type:", a.contractType, "pages", parsed.pageCount, "sections", parsed.sectionMap.length);
  for (const s of a.sections) console.log("  §" + s.ref, "|", s.heading.slice(0,40), "->", s.clauseType, s.score);
  for (const c of a.clauses) {
    console.log("  *", c.clauseType, JSON.stringify(c.fields), "\n     quote:", c.quotes[0].slice(0, 110));
  }
}

/**
 * src/lib/parse.ts
 *
 * Document parsing ahead of the LLM: PDF (unpdf), DOCX (mammoth), and
 * pasted text into structured blocks with page/offset bookkeeping. The
 * offsets here are what make source-span anchoring verifiable later.
 *
 * TODO:
 * - [ ] parsePdf/parseDocx/parseText -> ContractBlocks: [{page, offset,
 *       kind: heading|para|list, text}] with stable global offsets.
 * - [ ] Numbered-section detection (1., 1.1, (a), Roman) -> section map
 *       for the coverage checklist.
 * - [ ] Defined-terms pass: capture "Agreement", "Deliverables" etc. so
 *       explanations can resolve them.
 * - [ ] parse_warnings for unparseable regions (scanned pages, images,
 *       broken encoding) — surfaced as "not analyzed", never dropped.
 * - [ ] Guards: page limit (100), size limit, non-contract detection
 *       heuristic (reject a menu PDF with an honest error).
 */

export interface ContractBlock {
  page: number;
  offset: number;
  kind: "heading" | "para" | "list";
  text: string;
}

export interface ParseResult {
  blocks: ContractBlock[];
  sectionMap: Array<{ ref: string; blockIndex: number }>;
  warnings: string[];
}

export function parsePdf(_bytes: Uint8Array): Promise<ParseResult> {
  throw new Error("Not implemented");
}

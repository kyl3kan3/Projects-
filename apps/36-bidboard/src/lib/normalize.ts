/**
 * src/lib/normalize.ts
 *
 * Line-item normalization: mapping what subs submitted onto the GC's bid
 * form so the leveling grid has comparable rows. v1 is deterministic --
 * the portal presents the GC's own form, so most lines arrive pre-mapped;
 * this module handles the free-form remainder.
 *
 * TODO:
 * - [ ] Portal-form entries map 1:1 (bid_form_line_id set at submit,
 *       mapping_status = matched).
 * - [ ] Free-form rows: exact/prefix/token-overlap matching against the
 *       package's form lines; a confident match suggests, NEVER silently
 *       applies -- estimator confirms in the needs-mapping tray.
 * - [ ] rememberMapping(subCompanyId, rawDescription, formLineDescription):
 *       per-sub alias table so "temp power + poles" maps automatically on
 *       their next project (mapping_status = manual, mapped_by preserved).
 * - [ ] Lump-sum bids: single unmapped row carrying the total; leveling
 *       renders it as a column with one row and a "lump sum" flag.
 * - [ ] AI-assist hook (post-MVP): suggest-and-confirm mapping built on the
 *       accumulated correction corpus; interface defined here so the tray
 *       UI doesn't change when it lands.
 */

export interface MappingSuggestion {
  bidLineId: string;
  bidFormLineId: string;
  confidence: number;
}

export function suggestMappings(): Promise<MappingSuggestion[]> {
  throw new Error("Not implemented");
}

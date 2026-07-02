/**
 * Directory config — the ONE file that defines a deployment.
 * Copy this folder per niche; the engine reads DIRECTORY_CONFIG at build.
 *
 * TODO:
 * - [ ] finalize typed schema (zod) for: niche meta, domain, taxonomy,
 *       listing attribute schema, page-generation matrices, monetization
 *       (sponsored tiers, affiliate URL templates), branding
 */
export default {
  name: "Example Niche Directory",
  domain: "example.com",
  // attributeSchema drives comparison tables and thin-content scoring
  attributeSchema: {},
  pages: { bestFor: true, comparisons: true, alternatives: true, locations: false },
  monetization: { sponsoredTiers: [], affiliateUrlTemplate: null },
};

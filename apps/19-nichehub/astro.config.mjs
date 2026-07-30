// @ts-check
import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";
import tailwind from "@astrojs/tailwind";

/**
 * One codebase, many directories. Everything that differs between deployed
 * directories lives in configs/<niche>/directory.config.ts and is selected by
 * NICHE at build time -- see ARCHITECTURE.md.
 *
 * TODO:
 * - [ ] read the active niche config here and feed `site` from it
 * - [ ] add the pagefind build step as an integration hook (astro:build:done)
 * - [ ] per-niche output dir so several directories can build from one checkout
 */
const site = process.env.SITE_URL ?? "https://example.com";

export default defineConfig({
  site,
  integrations: [sitemap(), tailwind()],
  build: { format: "directory" },
});

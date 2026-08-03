/**
 * src/db/seed-sources.ts — `npm run db:seed-sources`
 *
 * Registers the launch feed set: federal (SAM.gov's documented Opportunities
 * API) plus five states chosen for feed quality, which is the only sane
 * selection criterion when fifty portals disagree about everything.
 *
 * A source is a **row**, not code. Its `config` names the URLs, the state code
 * stamped on its notices, and the field names its feed uses, so the four generic
 * connectors in lib/ingest.ts cover all of them and a sixth state is a seed
 * entry rather than a deploy.
 *
 * `sampleFallback: true` is set here because a development machine has no
 * SAM.gov key and often no route to a state portal. When a live fetch is
 * impossible the source serves bundled sample notices, flips itself to
 * `degraded`, and carries a "Sample feed — …" note that the radar and the
 * morning scan print verbatim. Set it to false in a production seed: there, a
 * portal that cannot be reached should read as down, because it is.
 */

import "@/lib/load-env";

import { eq } from "drizzle-orm";
import { closeDb, getDb } from "@/db";
import { sources } from "@/db/schema";
import type { SourceConfig } from "@/lib/ingest";

interface SeedSource {
  key: string;
  name: string;
  kind: "api" | "rss" | "csv" | "html";
  pollIntervalMinutes: number;
  config: SourceConfig;
}

const SEEDS: SeedSource[] = [
  {
    key: "sam",
    name: "SAM.gov (federal)",
    kind: "api",
    // Hourly with a posted-date cursor: the documented API, keyed and
    // rate-limited, and the only source that publishes amendments promptly.
    pollIntervalMinutes: 60,
    config: {
      state: null,
      limit: 200,
      descriptionBudget: 25,
      sampleFallback: true,
    },
  },
  {
    key: "va-eva",
    name: "Virginia eVA",
    kind: "rss",
    pollIntervalMinutes: 240,
    config: {
      state: "VA",
      urls: ["https://eva.virginia.gov/rss/public-solicitations.xml"],
      agencyFallback: "Commonwealth of Virginia",
      map: { due: "closeDate", questions: "questionsDue", naics: "naics" },
      sampleFallback: true,
    },
  },
  {
    key: "md-emma",
    name: "Maryland eMMA",
    kind: "rss",
    pollIntervalMinutes: 240,
    config: {
      state: "MD",
      urls: ["https://emma.maryland.gov/rss/solicitations.xml"],
      agencyFallback: "State of Maryland",
      map: { due: "responseDate" },
      sampleFallback: true,
    },
  },
  {
    key: "tx-esbd",
    name: "Texas ESBD",
    kind: "csv",
    pollIntervalMinutes: 360,
    config: {
      state: "TX",
      urls: ["https://www.txsmartbuy.gov/esbd/export.csv"],
      agencyFallback: "State of Texas",
      map: {
        id: "Solicitation ID",
        title: "Solicitation Title",
        agency: "Agency Name",
        due: "Response Due",
        posted: "Posted Date",
        description: "Description",
        naics: "NAICS Code",
        link: "URL",
      },
      sampleFallback: true,
    },
  },
  {
    key: "ga-gpr",
    name: "Georgia Procurement Registry",
    kind: "rss",
    pollIntervalMinutes: 360,
    config: {
      state: "GA",
      urls: ["https://ssl.doas.state.ga.us/gpr/rss/opportunities"],
      agencyFallback: "State of Georgia",
      map: { due: "bidDueDate" },
      sampleFallback: true,
    },
  },
  {
    key: "wa-webs",
    name: "Washington WEBS",
    kind: "html",
    // The one scraped source in the launch set, so it is the politest: four
    // fetches a day, one page at a time, honest User-Agent.
    pollIntervalMinutes: 360,
    config: {
      state: "WA",
      urls: ["https://pr-webs-vendor.des.wa.gov/Search_Bid_NoLogin.aspx"],
      agencyFallback: "State of Washington",
      selectors: {
        row: "table#bidSearchResults tbody tr",
        title: "td.bidTitle a",
        link: "td.bidTitle a",
        agency: "td.bidOrg",
        due: "td.bidDue",
        id: "td.bidNumber",
        description: "td.bidDesc",
      },
      sampleFallback: true,
    },
  },
];

async function main(): Promise<void> {
  const db = getDb();
  let inserted = 0;
  let updated = 0;

  for (const seed of SEEDS) {
    const [existing] = await db.select().from(sources).where(eq(sources.key, seed.key));
    if (existing) {
      await db
        .update(sources)
        .set({
          name: seed.name,
          kind: seed.kind,
          pollIntervalMinutes: seed.pollIntervalMinutes,
          config: seed.config as Record<string, unknown>,
          updatedAt: new Date(),
        })
        .where(eq(sources.id, existing.id));
      updated += 1;
      continue;
    }
    await db.insert(sources).values({
      key: seed.key,
      name: seed.name,
      kind: seed.kind,
      pollIntervalMinutes: seed.pollIntervalMinutes,
      status: "ok",
      statusNote: null,
      config: seed.config as Record<string, unknown>,
    });
    inserted += 1;
  }

  console.info(`[seed] sources: ${inserted} inserted, ${updated} updated`);
  await closeDb();
}

main().catch(async (error) => {
  console.error("[seed] failed:", error);
  await closeDb().catch(() => undefined);
  process.exit(1);
});

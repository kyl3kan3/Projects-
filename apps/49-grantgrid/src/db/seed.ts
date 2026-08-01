/**
 * Seed the funder database with **clearly labelled sample records**.
 *
 * This is the one place in GrantGrid where honesty costs something and matters
 * most. A grant-discovery product's credibility *is* its data, and a small
 * nonprofit has maybe ten hours a month to write applications. Shipping invented
 * foundations dressed as live opportunities would spend those hours on nothing.
 *
 * So every record here:
 *   - is named "Sample …", so it reads as a sample in any list, export or email;
 *   - carries `is_sample = true`, which the UI renders as a SAMPLE mark and uses
 *     to show a standing banner on the discovery screen;
 *   - has an EIN in the 00-xxxxxxx range, which the IRS does not issue;
 *   - links to example.org, not to any real funder's site.
 *
 * The giving histories are plausible and internally consistent — they have to be,
 * or the fit-score factors would be untestable — but they describe organizations
 * that do not exist. Real records arrive through `src/lib/irs990.ts` (IRS 990-PF
 * filings) and reach members only after a human approves them.
 *
 * Run with: npm run db:seed
 */

import { eq } from "drizzle-orm";
import { getDb, closeDb } from "@/db";
import { funderAwards, funders } from "@/db/schema";

interface SampleFunder {
  name: string;
  ein: string;
  kind: "private_foundation" | "community" | "corporate";
  city: string;
  state: string;
  statesFunded: string[];
  causeCodes: string[];
  grantSizeMinCents: number;
  grantSizeMaxCents: number;
  acceptsUnsolicited: boolean | null;
  applicationUrl: string;
  deadlinesNote: string;
  newGranteeShare: number | null;
  dataFreshnessAt: string;
  awards: {
    taxYear: number;
    recipientName: string;
    recipientState: string;
    amountCents: number;
    purposeExcerpt: string;
  }[];
}

const SAMPLE_FUNDERS: SampleFunder[] = [
  {
    name: "Sample Community Foundation of the Cuyahoga",
    ein: "00-1000001",
    kind: "community",
    city: "Cleveland",
    state: "OH",
    statesFunded: ["OH"],
    causeCodes: ["youth", "education", "arts"],
    grantSizeMinCents: 500_000,
    grantSizeMaxCents: 2_500_000,
    acceptsUnsolicited: true,
    applicationUrl: "https://example.org/sample-cuyahoga/apply",
    deadlinesNote:
      "Two cycles a year. LOI due 15 March and 15 September; full applications invited within four weeks.",
    newGranteeShare: 0.38,
    dataFreshnessAt: "2026-05-01",
    awards: [
      {
        taxYear: 2024,
        recipientName: "Sample Riverside Tutoring Project",
        recipientState: "OH",
        amountCents: 1_500_000,
        purposeExcerpt: "After-school tutoring for 180 middle-school students",
      },
      {
        taxYear: 2024,
        recipientName: "Sample Lakewood Community Kitchen",
        recipientState: "OH",
        amountCents: 750_000,
        purposeExcerpt: "General operating support",
      },
      {
        taxYear: 2023,
        recipientName: "Sample Eastside Youth Theatre",
        recipientState: "OH",
        amountCents: 1_200_000,
        purposeExcerpt: "Summer performance intensive",
      },
    ],
  },
  {
    name: "Sample Ohio Valley Family Trust",
    ein: "00-1000002",
    kind: "private_foundation",
    city: "Columbus",
    state: "OH",
    statesFunded: ["OH", "WV", "KY"],
    causeCodes: ["food", "housing", "health"],
    grantSizeMinCents: 1_000_000,
    grantSizeMaxCents: 5_000_000,
    acceptsUnsolicited: false,
    applicationUrl: "https://example.org/sample-ohio-valley",
    deadlinesNote:
      "By invitation only. Trustees review in February and August; an introduction from a current grantee is the usual route in.",
    newGranteeShare: 0.06,
    dataFreshnessAt: "2026-04-01",
    awards: [
      {
        taxYear: 2024,
        recipientName: "Sample Franklin County Food Bank",
        recipientState: "OH",
        amountCents: 4_000_000,
        purposeExcerpt: "Mobile pantry expansion, year two of three",
      },
      {
        taxYear: 2023,
        recipientName: "Sample Franklin County Food Bank",
        recipientState: "OH",
        amountCents: 4_000_000,
        purposeExcerpt: "Mobile pantry expansion, year one of three",
      },
    ],
  },
  {
    name: "Sample Great Lakes Youth Fund",
    ein: "00-1000003",
    kind: "private_foundation",
    city: "Detroit",
    state: "MI",
    statesFunded: ["MI", "OH", "IN"],
    causeCodes: ["youth", "workforce", "education"],
    grantSizeMinCents: 750_000,
    grantSizeMaxCents: 3_500_000,
    acceptsUnsolicited: true,
    applicationUrl: "https://example.org/sample-great-lakes/grants",
    deadlinesNote:
      "One cycle a year. Applications open 1 June and close 31 July; decisions by mid-October.",
    newGranteeShare: 0.44,
    dataFreshnessAt: "2026-06-01",
    awards: [
      {
        taxYear: 2024,
        recipientName: "Sample Detroit Literacy Alliance",
        recipientState: "MI",
        amountCents: 2_500_000,
        purposeExcerpt: "Paid teen apprenticeship program",
      },
      {
        taxYear: 2024,
        recipientName: "Sample Toledo Bridge Program",
        recipientState: "OH",
        amountCents: 1_000_000,
        purposeExcerpt: "Summer learning-loss intervention",
      },
      {
        taxYear: 2023,
        recipientName: "Sample Gary Youth Build",
        recipientState: "IN",
        amountCents: 1_800_000,
        purposeExcerpt: "Construction-trades pre-apprenticeship",
      },
    ],
  },
  {
    name: "Sample Keystone Arts & Heritage Foundation",
    ein: "00-1000004",
    kind: "private_foundation",
    city: "Pittsburgh",
    state: "PA",
    statesFunded: ["PA", "OH"],
    causeCodes: ["arts", "civic"],
    grantSizeMinCents: 250_000,
    grantSizeMaxCents: 1_500_000,
    acceptsUnsolicited: true,
    applicationUrl: "https://example.org/sample-keystone/apply",
    deadlinesNote: "Rolling review, decided quarterly. Apply at least 90 days before you need funds.",
    newGranteeShare: 0.51,
    dataFreshnessAt: "2026-03-01",
    awards: [
      {
        taxYear: 2024,
        recipientName: "Sample Allegheny Community Chorus",
        recipientState: "PA",
        amountCents: 400_000,
        purposeExcerpt: "Season support and free neighbourhood concerts",
      },
      {
        taxYear: 2024,
        recipientName: "Sample Youngstown Mural Project",
        recipientState: "OH",
        amountCents: 900_000,
        purposeExcerpt: "Three public murals with paid youth apprentices",
      },
    ],
  },
  {
    name: "Sample Midwest Grocers Corporate Giving",
    ein: "00-1000005",
    kind: "corporate",
    city: "Cincinnati",
    state: "OH",
    statesFunded: ["OH", "IN", "KY", "MI"],
    causeCodes: ["food", "youth"],
    grantSizeMinCents: 100_000,
    grantSizeMaxCents: 1_000_000,
    acceptsUnsolicited: true,
    applicationUrl: "https://example.org/sample-midwest-grocers/community",
    deadlinesNote:
      "Applications accepted year-round; reviewed monthly. Requires a store within 25 miles of the program site.",
    newGranteeShare: 0.62,
    dataFreshnessAt: "2026-06-01",
    awards: [
      {
        taxYear: 2024,
        recipientName: "Sample Hamilton County Backpack Program",
        recipientState: "OH",
        amountCents: 500_000,
        purposeExcerpt: "Weekend food bags for 400 students",
      },
      {
        taxYear: 2024,
        recipientName: "Sample Northside Teen Center",
        recipientState: "OH",
        amountCents: 250_000,
        purposeExcerpt: "Kitchen equipment for the culinary training program",
      },
    ],
  },
  {
    name: "Sample National Literacy Endowment",
    ein: "00-1000006",
    kind: "private_foundation",
    city: "Chicago",
    state: "IL",
    statesFunded: ["US"],
    causeCodes: ["education", "youth"],
    grantSizeMinCents: 2_500_000,
    grantSizeMaxCents: 15_000_000,
    acceptsUnsolicited: false,
    applicationUrl: "https://example.org/sample-national-literacy",
    deadlinesNote:
      "Concept notes accepted 1-31 January only. Highly competitive: roughly 4% of concept notes are invited to apply.",
    newGranteeShare: 0.11,
    dataFreshnessAt: "2026-02-01",
    awards: [
      {
        taxYear: 2024,
        recipientName: "Sample Reading Corps of the Southeast",
        recipientState: "GA",
        amountCents: 12_000_000,
        purposeExcerpt: "Multi-state tutoring corps, third year",
      },
      {
        taxYear: 2024,
        recipientName: "Sample Pacific Northwest Book Bank",
        recipientState: "WA",
        amountCents: 4_500_000,
        purposeExcerpt: "Home library distribution",
      },
    ],
  },
  {
    name: "Sample Buckeye Health Access Fund",
    ein: "00-1000007",
    kind: "community",
    city: "Akron",
    state: "OH",
    statesFunded: ["OH"],
    causeCodes: ["health", "seniors"],
    grantSizeMinCents: 1_500_000,
    grantSizeMaxCents: 7_500_000,
    acceptsUnsolicited: true,
    applicationUrl: "https://example.org/sample-buckeye-health",
    deadlinesNote:
      "LOI due 1 February; invited applications due 15 April. Interim and final reports required.",
    newGranteeShare: 0.29,
    dataFreshnessAt: "2026-05-01",
    awards: [
      {
        taxYear: 2024,
        recipientName: "Sample Summit County Free Clinic",
        recipientState: "OH",
        amountCents: 6_000_000,
        purposeExcerpt: "Behavioural health integration",
      },
      {
        taxYear: 2023,
        recipientName: "Sample Meals on Main Street",
        recipientState: "OH",
        amountCents: 2_000_000,
        purposeExcerpt: "Home-delivered meals for homebound older adults",
      },
    ],
  },
  {
    name: "Sample Watershed Conservation Trust",
    ein: "00-1000008",
    kind: "private_foundation",
    city: "Toledo",
    state: "OH",
    statesFunded: ["OH", "MI"],
    causeCodes: ["environment", "education"],
    grantSizeMinCents: 500_000,
    grantSizeMaxCents: 4_000_000,
    // Deliberately unknown: the UI must say "not published", never "no".
    acceptsUnsolicited: null,
    applicationUrl: "https://example.org/sample-watershed",
    deadlinesNote: "No published deadline. Board meets in March, July and November.",
    newGranteeShare: null,
    dataFreshnessAt: "2025-09-01",
    awards: [
      {
        taxYear: 2024,
        recipientName: "Sample Maumee River Keepers",
        recipientState: "OH",
        amountCents: 3_000_000,
        purposeExcerpt: "Riparian restoration and volunteer monitoring",
      },
    ],
  },
  {
    name: "Sample Capacity Builders Collaborative",
    ein: "00-1000009",
    kind: "private_foundation",
    city: "Cleveland",
    state: "OH",
    statesFunded: ["OH", "PA", "MI"],
    causeCodes: ["capacity", "civic"],
    grantSizeMinCents: 250_000,
    grantSizeMaxCents: 1_500_000,
    acceptsUnsolicited: true,
    applicationUrl: "https://example.org/sample-capacity-builders",
    deadlinesNote:
      "Open applications, reviewed every other month. Funds strategy, fundraising systems and staff development — not programs.",
    newGranteeShare: 0.71,
    dataFreshnessAt: "2026-06-01",
    awards: [
      {
        taxYear: 2024,
        recipientName: "Sample Riverside Tutoring Project",
        recipientState: "OH",
        amountCents: 350_000,
        purposeExcerpt: "Development-systems consulting",
      },
      {
        taxYear: 2024,
        recipientName: "Sample Erie Shore Land Trust",
        recipientState: "PA",
        amountCents: 750_000,
        purposeExcerpt: "Board development and succession planning",
      },
    ],
  },
  {
    name: "Sample Older Adults Legacy Fund",
    ein: "00-1000010",
    kind: "private_foundation",
    city: "Dayton",
    state: "OH",
    statesFunded: ["OH", "IN"],
    causeCodes: ["seniors", "health", "housing"],
    grantSizeMinCents: 1_000_000,
    grantSizeMaxCents: 6_000_000,
    acceptsUnsolicited: true,
    applicationUrl: "https://example.org/sample-older-adults",
    deadlinesNote: "One deadline a year: 1 October. Final report due 12 months after payment.",
    newGranteeShare: 0.22,
    dataFreshnessAt: "2026-01-01",
    awards: [
      {
        taxYear: 2024,
        recipientName: "Sample Montgomery County Senior Rides",
        recipientState: "OH",
        amountCents: 3_500_000,
        purposeExcerpt: "Volunteer transport program",
      },
    ],
  },
];

export async function seedFunders(): Promise<{ inserted: number; updated: number }> {
  const db = getDb();
  let inserted = 0;
  let updated = 0;

  for (const sample of SAMPLE_FUNDERS) {
    const [existing] = await db.select().from(funders).where(eq(funders.ein, sample.ein));

    const values = {
      name: sample.name,
      ein: sample.ein,
      kind: sample.kind,
      city: sample.city,
      state: sample.state,
      statesFunded: sample.statesFunded,
      causeCodes: sample.causeCodes,
      grantSizeMinCents: sample.grantSizeMinCents,
      grantSizeMaxCents: sample.grantSizeMaxCents,
      acceptsUnsolicited: sample.acceptsUnsolicited,
      applicationUrl: sample.applicationUrl,
      deadlinesNote: sample.deadlinesNote,
      newGranteeShare: sample.newGranteeShare,
      dataFreshnessAt: sample.dataFreshnessAt,
      // Approved so discovery has something to show, and sample so it can never
      // be mistaken for a live opportunity.
      curationStatus: "approved" as const,
      isSample: true,
    };

    let funderId: string;
    if (existing) {
      await db.update(funders).set({ ...values, updatedAt: new Date() }).where(eq(funders.id, existing.id));
      funderId = existing.id;
      updated++;
    } else {
      const [row] = await db.insert(funders).values(values).returning();
      funderId = row.id;
      inserted++;
    }

    if (sample.awards.length) {
      await db
        .insert(funderAwards)
        .values(sample.awards.map((a) => ({ funderId, ...a })))
        .onConflictDoNothing({
          target: [
            funderAwards.funderId,
            funderAwards.taxYear,
            funderAwards.recipientName,
            funderAwards.amountCents,
          ],
        });
    }
  }

  return { inserted, updated };
}

const isDirectRun =
  process.argv[1]?.endsWith("seed.ts") || process.argv[1]?.endsWith("seed.js");

if (isDirectRun) {
  seedFunders()
    .then(({ inserted, updated }) => {
      console.info(
        `[seed] ${inserted} sample funders inserted, ${updated} refreshed. All marked is_sample.`,
      );
    })
    .catch((err) => {
      console.error("[seed] failed", err);
      process.exitCode = 1;
    })
    .finally(() => closeDb());
}

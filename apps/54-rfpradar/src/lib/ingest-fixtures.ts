/**
 * src/lib/ingest-fixtures.ts
 *
 * Bundled sample notices, used when a source has no credential or no outbound
 * network — SAM.gov's Opportunities API needs a key (`SAM_GOV_API_KEY`), and a
 * state portal can simply be unreachable.
 *
 * These are **samples, not real notices.** Every fixture carries
 * `raw.fixture === true`, the source it lands under is flagged `degraded` with
 * the note "Sample feed — …", and the radar and morning scan render that note
 * verbatim. Nothing in the product ever presents a sample as a live tender.
 *
 * They exist so the ingestion spine, scoring, deadlines, and the whole response
 * workspace are exercisable end to end — the connector code path is identical,
 * only the bytes differ.
 *
 * The text is written to look like the real thing (section markers, evaluation
 * language, real agency names and NAICS codes) because the scorer's reasons quote
 * it verbatim: "'managed detection' found in scope §3.2" has to come from
 * somewhere.
 */

import type { RawNotice } from "@/lib/ingest";

const DAY = 86_400_000;

function at(now: Date, days: number, hour = 17): Date {
  const d = new Date(now.getTime() + days * DAY);
  d.setUTCHours(hour, 0, 0, 0);
  return d;
}

/**
 * Sample notices per source key. `now` anchors the dates so a demo always has
 * live deadlines instead of a wall of expired ones.
 */
export function fixtureNotices(sourceKey: string, now: Date = new Date()): RawNotice[] {
  const sets: Record<string, RawNotice[]> = {
    sam: [
      {
        externalId: "SAMPLE-W91QUZ-26-R-0114",
        title: "Managed Detection and Response Services for Army Enterprise Networks",
        agency: "Department of the Army, Army Contracting Command",
        state: null,
        naicsCodes: ["541512", "541519"],
        pscCodes: ["D310"],
        description: [
          "§1. Purpose. The Government requires continuous managed detection and response coverage for approximately 41,000 endpoints across three enterprise network enclaves.",
          "§2. Period of performance. One 12-month base period with four 12-month option periods.",
          "§3.1 Scope. The contractor shall provide 24x7x365 security operations centre monitoring, triage, and escalation.",
          "§3.2 Scope. Managed detection and response shall include endpoint telemetry collection, threat hunting, and incident containment within 15 minutes of a confirmed critical alert.",
          "§4. Evaluation. Award will be made on a best-value tradeoff basis: technical approach (40%), past performance on comparable enterprise SOC engagements (35%), price (25%).",
          "§5. Submission. One PDF volume per factor. Questions are due seven calendar days before the response date.",
        ].join("\n\n"),
        url: "https://sam.gov/search/?keywords=managed%20detection%20and%20response",
        postedAt: at(now, -3, 14),
        questionsDueAt: at(now, 9, 17),
        responsesDueAt: at(now, 21, 17),
        estValueBand: { minCents: 25_000_000_00, maxCents: 100_000_000_00 },
        raw: { fixture: true, sample: "sam-mdr" },
      },
      {
        externalId: "SAMPLE-GS-35F-26-0087",
        title: "Zero Trust Network Access Implementation and Migration Support",
        agency: "General Services Administration, Federal Acquisition Service",
        state: null,
        naicsCodes: ["541512"],
        pscCodes: ["D302"],
        description: [
          "§1. Background. GSA seeks implementation support to migrate 12 legacy VPN concentrators to a zero trust network access architecture.",
          "§2.1 Scope. Discovery and application inventory across four regions.",
          "§2.2 Scope. Policy authoring, identity provider integration, and phased cutover with rollback criteria at each gate.",
          "§3. Vehicle. This requirement will be competed among holders of the Multiple Award Schedule, SIN 54151S. Offerors without an active schedule contract are not eligible.",
          "§4. Evaluation. Lowest price technically acceptable.",
        ].join("\n\n"),
        url: "https://sam.gov/search/?keywords=zero%20trust%20network%20access",
        postedAt: at(now, -1, 11),
        questionsDueAt: at(now, 5, 17),
        responsesDueAt: at(now, 13, 17),
        estValueBand: { minCents: 80_000_00, maxCents: 400_000_00 },
        raw: { fixture: true, sample: "sam-ztna" },
      },
      {
        externalId: "SAMPLE-HHS-26-Q-2210",
        title: "Temporary Clinical Staffing Augmentation, Region IV",
        agency: "Department of Health and Human Services",
        state: null,
        naicsCodes: ["561320"],
        pscCodes: ["R499"],
        description: [
          "§1. The Government requires temporary staffing augmentation for registered nurses and allied health personnel.",
          "§2. Contractor shall supply credentialed personnel on 48-hour notice. Staffing agency past performance is required.",
        ].join("\n\n"),
        url: "https://sam.gov/search/?keywords=clinical%20staffing",
        postedAt: at(now, -2, 9),
        questionsDueAt: null,
        responsesDueAt: at(now, 17, 17),
        estValueBand: null,
        raw: { fixture: true, sample: "sam-staffing" },
      },
      {
        externalId: "SAMPLE-N00189-26-R-0043",
        title: "Cloud Security Posture Management and Compliance Reporting",
        agency: "Department of the Navy, NAVSUP Fleet Logistics Center",
        state: null,
        naicsCodes: ["541519", "541512"],
        pscCodes: ["D399"],
        description: [
          "§1. Requirement. Continuous cloud security posture management across two commercial cloud service providers.",
          "§2.1 Scope. Automated control assessment mapped to NIST SP 800-53 Rev 5 moderate baseline.",
          "§2.2 Scope. Monthly compliance reporting and remediation tracking, including drift detection.",
          "§3. Evaluation. Technical merit and price, with a mandatory oral presentation for offerors in the competitive range.",
        ].join("\n\n"),
        url: "https://sam.gov/search/?keywords=cloud%20security%20posture",
        postedAt: at(now, -5, 15),
        questionsDueAt: at(now, 2, 17),
        responsesDueAt: at(now, 10, 17),
        estValueBand: { minCents: 60_000_000_00 },
        raw: { fixture: true, sample: "sam-cspm" },
      },
    ],
    "va-eva": [
      {
        externalId: "SAMPLE-VA-DGS-26-0412",
        title: "Enterprise Endpoint Detection and Response Platform with Managed Services",
        agency: "Virginia Department of General Services, Division of Purchases and Supply",
        state: "VA",
        naicsCodes: ["541512"],
        pscCodes: ["D310"],
        description: [
          "Section 1. The Commonwealth of Virginia is seeking proposals for an enterprise endpoint detection and response platform with optional managed detection and response services for approximately 18,500 seats.",
          "Section 3.2 Scope of services. The successful offeror shall provide 24x7 monitoring, monthly threat reporting, and quarterly tabletop exercises with agency security staff.",
          "Section 4. Evaluation criteria. Qualifications and experience (30 points), proposed solution (30 points), references from comparable public-sector engagements (15 points), cost (25 points).",
          "Section 6. Small business. This solicitation is set aside for certified Small, Women-owned and Minority-owned (SWaM) businesses registered with the Department of Small Business and Supplier Diversity.",
        ].join("\n\n"),
        url: "https://eva.virginia.gov/pages/eva-public-solicitations.htm",
        postedAt: at(now, -4, 13),
        questionsDueAt: at(now, 6, 17),
        responsesDueAt: at(now, 19, 14),
        estValueBand: { minCents: 40_000_000_00, maxCents: 90_000_000_00 },
        raw: { fixture: true, sample: "va-edr" },
      },
      {
        externalId: "SAMPLE-VA-VDOT-26-1188",
        title: "Roadside Vegetation Management, Salem District",
        agency: "Virginia Department of Transportation",
        state: "VA",
        naicsCodes: ["561730"],
        pscCodes: ["F999"],
        description: [
          "Section 1. VDOT requires roadside mowing and vegetation control on approximately 2,300 lane miles in the Salem District.",
          "Section 2. Equipment and crew requirements are specified in Attachment B.",
        ].join("\n\n"),
        url: "https://eva.virginia.gov/pages/eva-public-solicitations.htm",
        postedAt: at(now, -6, 10),
        questionsDueAt: null,
        responsesDueAt: at(now, 12, 14),
        estValueBand: { minCents: 900_000_00, maxCents: 1_400_000_00 },
        raw: { fixture: true, sample: "va-vegetation" },
      },
    ],
    "md-emma": [
      {
        externalId: "SAMPLE-MD-DoIT-26-007-IT",
        title: "Security Operations Center Co-Management and Incident Response Retainer",
        agency: "Maryland Department of Information Technology",
        state: "MD",
        naicsCodes: ["541512", "541690"],
        pscCodes: ["D310"],
        description: [
          "Section 1. Purpose. The State requires co-management of its security operations centre, including managed detection and response for executive-branch agencies.",
          "Section 3.1 Scope. Tier 1 and Tier 2 alert triage during State holidays and outside 0700-1900 ET.",
          "Section 3.4 Scope. An incident response retainer of not fewer than 200 hours per contract year, callable within four hours.",
          "Section 5. Evaluation. Technical proposal 60%, financial proposal 40%. Oral presentations will be scheduled for offerors deemed reasonably susceptible of being selected for award.",
        ].join("\n\n"),
        url: "https://emma.maryland.gov/page.aspx/en/rfp/request_browse_public",
        postedAt: at(now, -2, 12),
        questionsDueAt: at(now, 4, 16),
        responsesDueAt: at(now, 16, 16),
        estValueBand: { minCents: 30_000_000_00, maxCents: 75_000_000_00 },
        raw: { fixture: true, sample: "md-soc" },
      },
    ],
    "tx-esbd": [
      {
        externalId: "SAMPLE-TX-DIR-26-CTSA-0091",
        title: "Managed Network and Security Services for State Agencies",
        agency: "Texas Department of Information Resources",
        state: "TX",
        naicsCodes: ["541513", "541512"],
        pscCodes: ["D316"],
        description: [
          "Section 1. DIR seeks vendors to provide managed network and managed detection and response services to state agencies, institutions of higher education, and local governments under a Cooperative Contract.",
          "Section 3.3 Scope. Managed detection and response, log retention of not less than 13 months, and quarterly executive reporting.",
          "Section 7. Vehicle. Award results in a DIR Cooperative Contract. Respondents must be able to accept purchase orders from any eligible customer without further competition.",
        ].join("\n\n"),
        url: "https://www.txsmartbuy.gov/esbd",
        postedAt: at(now, -7, 16),
        questionsDueAt: at(now, 1, 17),
        responsesDueAt: at(now, 27, 17),
        estValueBand: { minCents: 100_000_000_00 },
        raw: { fixture: true, sample: "tx-managed" },
      },
      {
        externalId: "SAMPLE-TX-TWC-26-0233",
        title: "Workforce Website Redesign and Accessibility Remediation",
        agency: "Texas Workforce Commission",
        state: "TX",
        naicsCodes: ["541511", "541430"],
        pscCodes: ["D302"],
        description: [
          "Section 1. TWC requires redesign of two public-facing websites and WCAG 2.1 AA accessibility remediation of approximately 900 templates and documents.",
          "Section 3.2 Scope. Content inventory, information architecture, design system, and remediation of legacy PDF forms.",
          "Section 4. Evaluation. Demonstrated public-sector accessibility remediation experience is weighted most heavily.",
        ].join("\n\n"),
        url: "https://www.txsmartbuy.gov/esbd",
        postedAt: at(now, -1, 9),
        questionsDueAt: at(now, 8, 17),
        responsesDueAt: at(now, 24, 17),
        estValueBand: { minCents: 45_000_00, maxCents: 120_000_00 },
        raw: { fixture: true, sample: "tx-web" },
      },
    ],
    "ga-gpr": [
      {
        externalId: "SAMPLE-GA-DOAS-26-40100-0056",
        title: "Statewide Cybersecurity Assessment and Penetration Testing Services",
        agency: "Georgia Department of Administrative Services",
        state: "GA",
        naicsCodes: ["541690", "541512"],
        pscCodes: ["D310"],
        description: [
          "Section 1. The State of Georgia requires third-party cybersecurity assessment, external and internal penetration testing, and social engineering assessment for participating agencies.",
          "Section 3.2 Scope. Annual external penetration test, quarterly vulnerability assessment, and one red-team engagement per contract year.",
          "Section 5. Evaluation. Cost is evaluated at 30%; technical and staffing at 70%.",
        ].join("\n\n"),
        url: "https://ssl.doas.state.ga.us/gpr/",
        postedAt: at(now, -9, 11),
        questionsDueAt: at(now, -1, 17),
        responsesDueAt: at(now, 6, 14),
        estValueBand: { minCents: 20_000_000_00, maxCents: 50_000_000_00 },
        raw: { fixture: true, sample: "ga-pentest" },
      },
    ],
    "wa-webs": [
      {
        externalId: "SAMPLE-WA-WaTech-26-0119",
        title: "Managed Detection and Response for Small Agency Cybersecurity Program",
        agency: "Washington Technology Solutions (WaTech)",
        state: "WA",
        naicsCodes: ["541512"],
        pscCodes: ["D310"],
        description: [
          "Section 1. WaTech is seeking a vendor to deliver managed detection and response to approximately 30 small agencies under the Small Agency Cybersecurity Program.",
          "Section 3.1 Scope. Onboarding of agency endpoint and cloud telemetry within 60 days of contract execution.",
          "Section 3.2 Scope. 24x7 managed detection and response with named analyst escalation contacts per agency.",
          "Section 6. Evaluation. Written response, then oral presentations for finalists. Apparent successful vendor must complete a security design review before award.",
        ].join("\n\n"),
        url: "https://pr-webs-vendor.des.wa.gov/",
        postedAt: at(now, -3, 10),
        questionsDueAt: at(now, 3, 15),
        responsesDueAt: at(now, 14, 15),
        estValueBand: { minCents: 15_000_000_00, maxCents: 35_000_000_00 },
        raw: { fixture: true, sample: "wa-mdr" },
      },
      {
        externalId: "SAMPLE-WA-DES-26-0288",
        title: "Janitorial Services, Capitol Campus Buildings 3 and 7",
        agency: "Washington Department of Enterprise Services",
        state: "WA",
        naicsCodes: ["561720"],
        pscCodes: ["S201"],
        description: [
          "Section 1. DES requires nightly janitorial services for two Capitol Campus buildings totalling 214,000 square feet.",
          "Section 2. Prevailing wage applies. Subcontractor use must be disclosed.",
        ].join("\n\n"),
        url: "https://pr-webs-vendor.des.wa.gov/",
        postedAt: at(now, -8, 8),
        questionsDueAt: null,
        responsesDueAt: at(now, 11, 15),
        estValueBand: { minCents: 600_000_00, maxCents: 1_100_000_00 },
        raw: { fixture: true, sample: "wa-janitorial" },
      },
    ],
  };

  return sets[sourceKey] ?? [];
}

/** True when this notice came from the bundled sample set, not a live feed. */
export function isFixtureNotice(raw: unknown): boolean {
  return Boolean(raw && typeof raw === "object" && (raw as { fixture?: boolean }).fixture);
}

import assert from "node:assert/strict";
import { test } from "node:test";
import {
  deriveSignals,
  fixtureFilingSource,
  normalizeEin,
  normalizeRecipient,
  parse990Amount,
  parse990PF,
} from "./irs990";

/**
 * A 990-PF fragment in the shape the IRS actually publishes (element names from
 * the 990-PF schema: ReturnHeader/Filer, IRS990PF/SupplementaryInformationGrp/
 * GrantOrContributionPdDurYrGrp). Trimmed to what the parser reads.
 */
const FILING_XML = `<?xml version="1.0" encoding="UTF-8"?>
<Return returnVersion="2023v4.0" xmlns="http://www.irs.gov/efile">
  <ReturnHeader>
    <TaxYr>2023</TaxYr>
    <TaxPeriodEndDt>2023-12-31</TaxPeriodEndDt>
    <Filer>
      <EIN>341234567</EIN>
      <BusinessName>
        <BusinessNameLine1Txt>Sample Cuyahoga Family Foundation</BusinessNameLine1Txt>
      </BusinessName>
      <USAddress>
        <CityNm>Cleveland</CityNm>
        <StateAbbreviationCd>OH</StateAbbreviationCd>
      </USAddress>
    </Filer>
  </ReturnHeader>
  <ReturnData>
    <IRS990PF>
      <SupplementaryInformationGrp>
        <GrantOrContributionPdDurYrGrp>
          <RecipientBusinessName>
            <BusinessNameLine1Txt>Riverside Youth Collective</BusinessNameLine1Txt>
          </RecipientBusinessName>
          <RecipientUSAddress>
            <StateAbbreviationCd>OH</StateAbbreviationCd>
          </RecipientUSAddress>
          <GrantOrContributionPurposeTxt>After-school tutoring program support</GrantOrContributionPurposeTxt>
          <Amt>15000</Amt>
        </GrantOrContributionPdDurYrGrp>
        <GrantOrContributionPdDurYrGrp>
          <RecipientBusinessName>
            <BusinessNameLine1Txt>Lakewood Community Kitchen, Inc.</BusinessNameLine1Txt>
          </RecipientBusinessName>
          <RecipientUSAddress>
            <StateAbbreviationCd>OH</StateAbbreviationCd>
          </RecipientUSAddress>
          <GrantOrContributionPurposeTxt>General operating support</GrantOrContributionPurposeTxt>
          <Amt>7,500</Amt>
        </GrantOrContributionPdDurYrGrp>
        <GrantOrContributionPdDurYrGrp>
          <RecipientBusinessName>
            <BusinessNameLine1Txt>Detroit Literacy Alliance</BusinessNameLine1Txt>
          </RecipientBusinessName>
          <RecipientUSAddress>
            <StateAbbreviationCd>MI</StateAbbreviationCd>
          </RecipientUSAddress>
          <Amt>25000.00</Amt>
        </GrantOrContributionPdDurYrGrp>
        <GrantOrContributionPdDurYrGrp>
          <RecipientBusinessName>
            <BusinessNameLine1Txt>Bad Row With No Amount</BusinessNameLine1Txt>
          </RecipientBusinessName>
        </GrantOrContributionPdDurYrGrp>
      </SupplementaryInformationGrp>
    </IRS990PF>
  </ReturnData>
</Return>`;

test("a 990-PF filing parses into a funder proposal and its grant schedule", () => {
  const filing = parse990PF(FILING_XML);
  assert.ok(filing);
  assert.equal(filing.ein, "34-1234567");
  assert.equal(filing.name, "Sample Cuyahoga Family Foundation");
  assert.equal(filing.city, "Cleveland");
  assert.equal(filing.state, "OH");
  assert.equal(filing.taxYear, 2023);
  // Three usable lines; the one with no amount is skipped, not zeroed.
  assert.equal(filing.grants.length, 3);
  assert.deepEqual(filing.grants[0], {
    recipientName: "Riverside Youth Collective",
    recipientState: "OH",
    amountCents: 1_500_000,
    purposeExcerpt: "After-school tutoring program support",
  });
  assert.equal(filing.grants[1].amountCents, 750_000);
  assert.equal(filing.grants[2].amountCents, 2_500_000);
});

test("malformed filings skip rather than throwing the batch away", () => {
  assert.equal(parse990PF("not xml at all <<<"), null);
  assert.equal(parse990PF("<Return></Return>"), null);
  assert.equal(
    parse990PF("<Return><ReturnHeader><TaxYr>2023</TaxYr></ReturnHeader></Return>"),
    null,
  );
  // A filing with a header but no EIN cannot be keyed, so it is refused.
  assert.equal(
    parse990PF(
      `<Return><ReturnHeader><TaxYr>2023</TaxYr><Filer><BusinessName><BusinessNameLine1Txt>X</BusinessNameLine1Txt></BusinessName></Filer></ReturnHeader><ReturnData><IRS990PF/></ReturnData></Return>`,
    ),
    null,
  );
});

test("990 dollar amounts become integer cents, and junk becomes null", () => {
  assert.equal(parse990Amount("25000"), 2_500_000);
  assert.equal(parse990Amount("25,000"), 2_500_000);
  assert.equal(parse990Amount("25000.00"), 2_500_000);
  assert.equal(parse990Amount("$1,250.50"), 125_050);
  assert.equal(parse990Amount(""), null);
  assert.equal(parse990Amount("0"), null);
  assert.equal(parse990Amount("-500"), null);
  assert.equal(parse990Amount("see attached"), null);
  assert.equal(parse990Amount(undefined), null);
});

test("EINs normalise to the display form, and bad ones are refused", () => {
  assert.equal(normalizeEin("341234567"), "34-1234567");
  assert.equal(normalizeEin("34-1234567"), "34-1234567");
  assert.equal(normalizeEin("34 123 4567"), "34-1234567");
  assert.equal(normalizeEin("12345"), null);
  assert.equal(normalizeEin("APPLIED FOR"), null);
});

test("derived signals use a p25-p75 band, not min-max", () => {
  const filing = parse990PF(FILING_XML)!;
  const signals = deriveSignals(filing, []);
  // Amounts sorted: 750_000, 1_500_000, 2_500_000. p25 = 1_125_000, p75 = 2_000_000.
  assert.equal(signals.grantSizeMinCents, 1_125_000);
  assert.equal(signals.grantSizeMaxCents, 2_000_000);
  assert.deepEqual(signals.statesFunded, ["MI", "OH"]);
  // Freshness is the filing's tax year, never the day the ingest ran.
  assert.equal(signals.dataFreshnessAt, "2023-12-31");
});

test("new-grantee share is null with no history, not zero", () => {
  const filing = parse990PF(FILING_XML)!;
  assert.equal(deriveSignals(filing, []).newGranteeShare, null);

  // Two of three recipients seen before → one third are new.
  const withHistory = deriveSignals(filing, [
    "Riverside Youth Collective",
    "Lakewood Community Kitchen Inc",
  ]);
  assert.equal(withHistory.newGranteeShare, 0.33);

  // All seen before → 0, which is a real answer and different from unknown.
  const allKnown = deriveSignals(filing, [
    "Riverside Youth Collective",
    "Lakewood Community Kitchen, Inc.",
    "Detroit Literacy Alliance",
  ]);
  assert.equal(allKnown.newGranteeShare, 0);
});

test("recipient names match across punctuation and legal-suffix noise", () => {
  assert.equal(
    normalizeRecipient("Lakewood Community Kitchen, Inc."),
    normalizeRecipient("LAKEWOOD COMMUNITY KITCHEN INC"),
  );
  assert.equal(
    normalizeRecipient("The Riverside Youth Collective"),
    normalizeRecipient("Riverside Youth Collective"),
  );
  assert.notEqual(
    normalizeRecipient("Riverside Youth Collective"),
    normalizeRecipient("Riverside Youth Coalition"),
  );
});

test("the fixture source is what makes ingestion testable without the IRS", async () => {
  const source = fixtureFilingSource([FILING_XML, "garbage"]);
  assert.equal(source.kind, "fixture");
  const seen: string[] = [];
  for await (const doc of source.filings(2023, ["OH"])) seen.push(doc);
  assert.equal(seen.length, 2);
});
